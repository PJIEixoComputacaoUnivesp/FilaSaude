import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Keeps the data behind the wait estimate apart from the inbox.
 *
 * `occupancy_flow_sample` holds only the flow counts of the recent window. The
 * snapshots of one unit are spread over the whole inbox, so reading them there
 * costs one random heap read per snapshot on every national request.
 *
 * `occupancy_wait_sample` holds the estimates taken at a fixed cadence and
 * `occupancy_wait_baseline` their summary by unit, read with the current state.
 *
 * The backfill copies the recent window, so estimates stay available across
 * the deploy. It uses the unit index, not a sequential read of the inbox.
 */
export class CreateOccupancyWaitTables1765000000000 implements MigrationInterface {
  name = 'CreateOccupancyWaitTables1765000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'occupancy_flow_sample',
        columns: [
          { name: 'event_id', type: 'varchar', length: '26', isPrimary: true },
          { name: 'unit_cnes', type: 'varchar', length: '7' },
          { name: 'source_id', type: 'varchar', length: '128' },
          { name: 'attendance', type: 'jsonb' },
          { name: 'occurred_at', type: 'timestamptz' },
          { name: 'observed_at', type: 'timestamptz' },
          { name: 'received_at', type: 'timestamptz' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'occupancy_flow_sample',
      new TableIndex({
        name: 'idx_occupancy_flow_sample_unit_occurred',
        columnNames: ['unit_cnes', 'occurred_at'],
      }),
    );
    await queryRunner.createTable(
      new Table({
        name: 'occupancy_wait_sample',
        columns: [
          { name: 'unit_cnes', type: 'varchar', length: '7', isPrimary: true },
          { name: 'sampled_at', type: 'timestamptz', isPrimary: true },
          { name: 'minutes', type: 'integer' },
        ],
      }),
    );
    await queryRunner.createTable(
      new Table({
        name: 'occupancy_wait_baseline',
        columns: [
          { name: 'unit_cnes', type: 'varchar', length: '7', isPrimary: true },
          { name: 'typical_minutes', type: 'integer' },
          { name: 'upper_minutes', type: 'integer' },
          { name: 'sample_count', type: 'integer' },
          { name: 'window_start', type: 'timestamptz' },
          { name: 'window_end', type: 'timestamptz' },
        ],
      }),
    );
    await queryRunner.query(`
      INSERT INTO occupancy_flow_sample
        (event_id, unit_cnes, source_id, attendance, occurred_at, observed_at, received_at)
      SELECT recent.event_id, recent.unit_cnes, recent.source_id,
             jsonb_strip_nulls(jsonb_build_object(
               'waiting', recent.attendance->'waiting',
               'inService', recent.attendance->'inService',
               'completed', recent.attendance->'completed'
             )),
             recent.occurred_at, recent.observed_at, recent.received_at
      FROM occupancy_current AS current_state
      CROSS JOIN LATERAL (
        SELECT event_id, unit_cnes, source_id, payload->'attendance' AS attendance,
               occurred_at, observed_at, received_at
        FROM occupancy_webhook_inbox
        WHERE unit_cnes = current_state.unit_cnes AND status = 'processed'
          AND occurred_at >= now() - interval '90 minutes'
      ) AS recent
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('occupancy_wait_baseline');
    await queryRunner.dropTable('occupancy_wait_sample');
    await queryRunner.dropTable('occupancy_flow_sample');
  }
}
