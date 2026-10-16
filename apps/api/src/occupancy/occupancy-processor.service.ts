import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OccupancyRepository } from '../database/repositories/occupancy.repository.js';
import {
  OCCUPANCY_SETTINGS,
  type OccupancySettings,
} from './occupancy-settings.js';

const RETENTION_SWEEP_MS = 60 * 60_000;

/**
 * Drains the webhook inbox into the current occupancy. The webhook answers 202
 * as soon as the event is stored; this runs on its own clock, so a burst of
 * snapshots only grows the inbox for a moment instead of slowing the senders.
 * Several API instances can run it together (see PROCESS_PENDING_SQL).
 */
@Injectable()
export class OccupancyProcessorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OccupancyProcessorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private lastSweep = 0;

  constructor(
    private readonly repository: OccupancyRepository,
    @Inject(OCCUPANCY_SETTINGS) private readonly settings: OccupancySettings,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.settings.processorEnabled) return;
    this.timer = setInterval(() => {
      // A slow run is never overlapped by the next tick.
      this.running ??= this.tick().finally(() => {
        this.running = null;
      });
    }, this.settings.processorIntervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  private async tick(): Promise<void> {
    try {
      await this.drain();
      await this.sweep(new Date());
    } catch (error) {
      this.logger.error(`Occupancy processing failed: ${messageOf(error)}`);
    }
  }

  /** Processes full batches until the inbox has no pending events left. */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const processed = await this.processBatch();
      total += processed;
      if (processed < this.settings.batchSize) return total;
    }
  }

  /**
   * One batch in one statement. If it fails, each event is tried on its own,
   * so a single bad event is marked as failed instead of blocking the inbox.
   */
  private async processBatch(): Promise<number> {
    try {
      const { processed } = await this.repository.processPending(
        this.settings.batchSize,
      );
      return processed;
    } catch (batchError) {
      this.logger.warn(
        `Batch failed, isolating events: ${messageOf(batchError)}`,
      );
      const eventIds = await this.repository.findPendingEventIds(
        this.settings.batchSize,
      );
      let processed = 0;
      for (const eventId of eventIds) {
        try {
          processed += (await this.repository.processPending(1, eventId))
            .processed;
        } catch (error) {
          // Only a problem with the event itself is final. A deadlock, a
          // timeout or a lost connection leaves it pending for the next tick.
          if (!isPermanentFailure(error)) throw error;
          await this.repository.markFailed(eventId, messageOf(error));
          processed += 1;
        }
      }
      return processed;
    }
  }

  async sweep(now: Date): Promise<void> {
    if (now.getTime() - this.lastSweep < RETENTION_SWEEP_MS) return;
    this.lastSweep = now.getTime();
    await this.repository.deleteProcessedBefore(
      new Date(now.getTime() - this.settings.retentionMs),
    );
  }
}

/** SQLSTATE classes 22 (data exception) and 23 (integrity constraint). */
export function isPermanentFailure(error: unknown): boolean {
  const code =
    error instanceof QueryFailedError
      ? (error.driverError as { code?: unknown } | undefined)?.code
      : undefined;
  return typeof code === 'string' && /^2[23]/.test(code);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
