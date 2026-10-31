import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { OccupancyRepository } from '../database/repositories/occupancy.repository.js';
import {
  OCCUPANCY_SETTINGS,
  type OccupancySettings,
} from './occupancy-settings.js';
import { OccupancyService } from './occupancy.service.js';
import {
  WAIT_BASELINE_WINDOW_MS,
  WAIT_SAMPLE_INTERVAL_MS,
} from './wait-comparison.js';
import { WAIT_ESTIMATE_WINDOW_MS } from './wait-estimate.js';

const CHECK_MS = 60_000;
/** Late snapshots may still enter the window of a stale unit's last estimate. */
const FLOW_MARGIN_MS = 15 * 60_000;

/**
 * Records the estimate of every unit at a fixed cadence, independent of
 * visitors, and summarizes the readings by unit. The cadence is aligned to the
 * clock and the samples are unique per unit and instant, so several API
 * instances can run it together. It also keeps the flow samples bounded.
 */
@Injectable()
export class OccupancyWaitBaselineService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OccupancyWaitBaselineService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private lastSlot = 0;

  constructor(
    private readonly repository: OccupancyRepository,
    private readonly occupancy: OccupancyService,
    @Inject(OCCUPANCY_SETTINGS) private readonly settings: OccupancySettings,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.settings.processorEnabled) return;
    this.timer = setInterval(() => {
      this.running ??= this.sample(new Date()).finally(() => {
        this.running = null;
      });
    }, CHECK_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /**
   * Runs once per slot, even after a failure: one lost reading does not change
   * the baseline, and repeating a national read would load a struggling
   * database. Each step is independent, so the flow samples stay bounded while
   * the readings fail.
   */
  async sample(now: Date): Promise<void> {
    const slot = Math.floor(now.getTime() / WAIT_SAMPLE_INTERVAL_MS);
    if (slot === this.lastSlot) return;
    this.lastSlot = slot;

    const steps = await Promise.allSettled([
      this.recordReadings(now, slot),
      this.repository.deleteFlowSamplesBefore(
        new Date(
          now.getTime() -
            this.settings.staleAfterMs -
            WAIT_ESTIMATE_WINDOW_MS -
            FLOW_MARGIN_MS,
        ),
      ),
    ]);
    for (const step of steps) {
      if (step.status === 'rejected') {
        this.logger.error(
          `Wait sampling failed: ${step.reason instanceof Error ? step.reason.message : 'unknown error'}`,
        );
      }
    }
  }

  private async recordReadings(now: Date, slot: number): Promise<void> {
    const { data } = await this.occupancy.findCurrent(now);
    await this.repository.recordWaitSamples(
      data.flatMap(({ unitCnes, waitEstimate }) =>
        waitEstimate.status === 'available'
          ? [{ unitCnes, minutes: waitEstimate.minutes }]
          : [],
      ),
      new Date(slot * WAIT_SAMPLE_INTERVAL_MS),
      new Date(now.getTime() - WAIT_BASELINE_WINDOW_MS),
    );
  }
}
