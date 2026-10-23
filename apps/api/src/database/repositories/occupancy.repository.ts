import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  OccupancyCurrentEntity,
  type OccupancyAttendanceValue,
  type OccupancyCategoryValue,
} from '../entities/occupancy-current.entity.js';

export interface ProcessedBatch {
  /** Inbox events marked as processed. */
  processed: number;
  /** Units whose current state changed. */
  applied: number;
}

export interface OccupancyHistoryRow {
  eventId: string;
  categories: OccupancyCategoryValue[];
  attendance: OccupancyAttendanceValue | null;
  occurredAt: Date;
  observedAt: Date;
  receivedAt: Date;
}

const HISTORY_LIMIT = 2000;
const ERROR_MAX_LENGTH = 500;

/**
 * Applies a batch of pending inbox events in one statement:
 *
 * - `FOR UPDATE SKIP LOCKED` lets several workers drain the inbox at once
 *   without taking the same event twice;
 * - only the most recent event of each unit in the batch is upserted (one
 *   statement cannot update the same row twice);
 * - the upsert only replaces a state that is older by the contract order
 *   (occurredAt, observedAt, receivedAt, eventId), so a late event stays in
 *   the history without overwriting a newer state, whichever worker wins;
 * - every event of the batch is marked as processed, applied or not, so a
 *   duplicate or a late event never comes back.
 *
 * The snapshot is complete, so a newer one without `attendance` (v1, or v2
 * without the flow) clears it to NULL: "not informed", never zero. Completed
 * totals are cumulative per period and replaced, never added up.
 *
 * `$2` restricts the batch to one event, used to isolate a failing one.
 */
const PROCESS_PENDING_SQL = `
WITH batch AS (
  SELECT event_id, source_id, unit_cnes, payload, occurred_at, observed_at, received_at
  FROM occupancy_webhook_inbox
  WHERE status = 'pending' AND ($2::varchar IS NULL OR event_id = $2)
  ORDER BY received_at, event_id
  LIMIT $1
  FOR UPDATE SKIP LOCKED
),
latest AS (
  SELECT DISTINCT ON (unit_cnes) *
  FROM batch
  ORDER BY unit_cnes, occurred_at DESC, observed_at DESC, received_at DESC, event_id DESC
),
applied AS (
  INSERT INTO occupancy_current
    (unit_cnes, event_id, source_id, categories, attendance, occurred_at, observed_at, received_at, updated_at)
  SELECT unit_cnes, event_id, source_id, payload->'categories', payload->'attendance',
         occurred_at, observed_at, received_at, now()
  FROM latest
  ON CONFLICT (unit_cnes) DO UPDATE SET
    event_id = EXCLUDED.event_id,
    source_id = EXCLUDED.source_id,
    categories = EXCLUDED.categories,
    attendance = EXCLUDED.attendance,
    occurred_at = EXCLUDED.occurred_at,
    observed_at = EXCLUDED.observed_at,
    received_at = EXCLUDED.received_at,
    updated_at = now()
  WHERE (occupancy_current.occurred_at, occupancy_current.observed_at,
         occupancy_current.received_at, occupancy_current.event_id)
      < (EXCLUDED.occurred_at, EXCLUDED.observed_at,
         EXCLUDED.received_at, EXCLUDED.event_id)
  RETURNING unit_cnes
),
marked AS (
  UPDATE occupancy_webhook_inbox AS inbox
  SET status = 'processed', processed_at = now(), processing_error = NULL
  FROM batch
  WHERE inbox.event_id = batch.event_id
  RETURNING inbox.event_id, inbox.unit_cnes
),
notified AS MATERIALIZED (
  SELECT pg_notify('filasaude_occupancy', unit_cnes)
  FROM (SELECT DISTINCT unit_cnes FROM marked) AS changed
)
SELECT
  (SELECT count(*) FROM marked)::int AS processed,
  (SELECT count(*) FROM applied)::int AS applied,
  (SELECT count(*) FROM notified)::int AS notifications
`;

@Injectable()
export class OccupancyRepository {
  constructor(
    @InjectRepository(OccupancyCurrentEntity)
    private readonly repository: Repository<OccupancyCurrentEntity>,
  ) {}

  async processPending(
    limit: number,
    eventId: string | null = null,
  ): Promise<ProcessedBatch> {
    const rows = (await this.repository.query(PROCESS_PENDING_SQL, [
      limit,
      eventId,
    ])) as ProcessedBatch[];
    return {
      processed: rows[0]?.processed ?? 0,
      applied: rows[0]?.applied ?? 0,
    };
  }

  async findPendingEventIds(limit: number): Promise<string[]> {
    const rows = (await this.repository.query(
      `SELECT event_id FROM occupancy_webhook_inbox
       WHERE status = 'pending' ORDER BY received_at, event_id LIMIT $1`,
      [limit],
    )) as { event_id: string }[];
    return rows.map((row) => row.event_id);
  }

  /** Keeps a failing event out of the next batches, with its reason. */
  async markFailed(eventId: string, reason: string): Promise<void> {
    await this.repository.query(
      `UPDATE occupancy_webhook_inbox
       SET status = 'failed', processed_at = now(), processing_error = $2
       WHERE event_id = $1 AND status = 'pending'`,
      [eventId, reason.slice(0, ERROR_MAX_LENGTH)],
    );
  }

  /** Processed events older than the cutoff leave the history. */
  async deleteProcessedBefore(cutoff: Date): Promise<void> {
    await this.repository.query(
      `DELETE FROM occupancy_webhook_inbox
       WHERE status = 'processed' AND received_at < $1`,
      [cutoff],
    );
  }

  findCurrent(): Promise<OccupancyCurrentEntity[]> {
    return this.repository.find({ order: { unitCnes: 'ASC' } });
  }

  findCurrentForUnits(
    unitCnes: readonly string[],
  ): Promise<OccupancyCurrentEntity[]> {
    return this.repository.find({
      where: { unitCnes: In([...unitCnes]) },
      order: { unitCnes: 'ASC' },
    });
  }

  findCurrentByUnit(unitCnes: string): Promise<OccupancyCurrentEntity | null> {
    return this.repository.findOneBy({ unitCnes });
  }

  /** Every processed snapshot of the unit since the cutoff, oldest first. */
  async findHistory(
    unitCnes: string,
    since: Date,
  ): Promise<OccupancyHistoryRow[]> {
    const rows = (await this.repository.query(
      `SELECT event_id, payload->'categories' AS categories,
              payload->'attendance' AS attendance, occurred_at, observed_at, received_at
       FROM occupancy_webhook_inbox
       WHERE unit_cnes = $1 AND status = 'processed' AND occurred_at >= $2
       ORDER BY occurred_at DESC, observed_at DESC, received_at DESC, event_id DESC
       LIMIT $3`,
      [unitCnes, since, HISTORY_LIMIT],
    )) as {
      event_id: string;
      categories: OccupancyCategoryValue[];
      attendance: OccupancyAttendanceValue | null;
      occurred_at: Date;
      observed_at: Date;
      received_at: Date;
    }[];
    // Read newest first, so the limit drops the oldest snapshots.
    return rows.reverse().map((row) => ({
      eventId: row.event_id,
      categories: row.categories,
      attendance: row.attendance ?? null,
      occurredAt: new Date(row.occurred_at),
      observedAt: new Date(row.observed_at),
      receivedAt: new Date(row.received_at),
    }));
  }
}
