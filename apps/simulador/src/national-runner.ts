import { createHash } from 'node:crypto';
import type { SimulatorConfig } from './config.ts';
import { LoadMetrics, type LoadReport } from './load-metrics.ts';
import { NationalSchedule } from './national-scheduler.ts';
import { SimulationState, type OccupancySnapshot } from './simulation.ts';
import type { SnapshotTransportResult } from './transport.ts';
import { sendSnapshot } from './transport.ts';
import type { SimulatorUnit } from './units.ts';

export interface NationalRunnerOptions {
  now?: () => Date;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  send?: (
    snapshot: OccupancySnapshot,
    sourceId: string,
    signal?: AbortSignal,
  ) => Promise<SnapshotTransportResult>;
  onReport?: (report: LoadReport) => void;
}

export class NationalLoadRunner {
  private readonly config: SimulatorConfig;
  private readonly units: readonly SimulatorUnit[];
  private readonly state: SimulationState;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly send: (
    snapshot: OccupancySnapshot,
    sourceId: string,
    signal?: AbortSignal,
  ) => Promise<SnapshotTransportResult>;
  private readonly onReport?: NationalRunnerOptions['onReport'];

  constructor(
    config: SimulatorConfig,
    units: readonly SimulatorUnit[],
    state: SimulationState,
    options: NationalRunnerOptions = {},
  ) {
    this.config = config;
    this.units = units;
    this.state = state;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? delay;
    this.send =
      options.send ??
      ((snapshot, sourceId, signal) =>
        sendSnapshot(snapshot, { ...config, sourceId, signal }));
    this.onReport = options.onReport;
  }

  async run(signal?: AbortSignal): Promise<LoadReport> {
    const metrics = new LoadMetrics();
    const startedAt = this.now().getTime();
    const deadline = startedAt + this.config.durationSeconds * 1000;
    let nextReportAt = startedAt + this.config.reportIntervalSeconds * 1000;
    const schedule = new NationalSchedule({
      seed: this.config.seed,
      intervalSeconds: this.config.intervalSeconds,
      units: this.units,
      startedAt,
    });
    const inFlight = new Set<Promise<void>>();

    while (!signal?.aborted && this.now().getTime() < deadline) {
      const item = schedule.next();
      if (!item) break;

      await waitUntil(item.scheduledAt, this.now, this.sleep, signal);
      if (signal?.aborted || this.now().getTime() >= deadline) break;

      const task = this.sendEvent(item, metrics, signal);
      let tracked: Promise<void>;
      tracked = task.finally(() => inFlight.delete(tracked));
      inFlight.add(tracked);
      schedule.scheduleNext(item);

      if (inFlight.size >= this.config.concurrency) {
        await Promise.race(inFlight);
      }

      const currentTime = this.now().getTime();
      if (currentTime >= nextReportAt) {
        this.onReport?.(this.buildReport(metrics, startedAt));
        nextReportAt = currentTime + this.config.reportIntervalSeconds * 1000;
      }
    }

    await Promise.all(inFlight);

    const report = this.buildReport(metrics, startedAt);
    this.onReport?.(report);
    return report;
  }

  private async sendEvent(
    item: { unit: SimulatorUnit; occurrence: number },
    metrics: LoadMetrics,
    signal?: AbortSignal,
  ): Promise<void> {
    const snapshot = this.state.snapshotFor(item.unit, this.now());
    this.state.advanceUnit(item.unit, item.occurrence + 1);
    const sourceId = this.sourceIdFor(item.unit.id);
    const sentAt = this.now().getTime();
    metrics.recordGenerated();
    try {
      const result = await this.send(snapshot, sourceId, signal);
      metrics.recordResult(result, this.now().getTime() - sentAt);
    } catch (error) {
      if (signal?.aborted) return;
      metrics.recordError(error);
    }
  }

  private buildReport(metrics: LoadMetrics, startedAt: number): LoadReport {
    return {
      ...metrics.snapshot(),
      durationSeconds: (this.now().getTime() - startedAt) / 1000,
      seed: this.config.seed,
      units: this.units.length,
      sourceIds: [...this.config.sourceIds],
    };
  }

  private sourceIdFor(unitCnes: string): string {
    const digest = createHash('sha256')
      .update(`${this.config.seed}:${unitCnes}`)
      .digest();
    const index = digest.readUInt32BE(0) % this.config.sourceIds.length;
    return this.config.sourceIds[index]!;
  }
}

async function waitUntil(
  target: number,
  now: () => Date,
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  while (!signal?.aborted) {
    const remaining = target - now().getTime();
    if (remaining <= 0) return;
    await sleep(remaining, signal);
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Execução cancelada.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
