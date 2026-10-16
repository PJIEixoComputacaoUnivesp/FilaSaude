import { createHash } from 'node:crypto';
import type { SimulatorConfig } from './config.ts';
import { LoadMetrics, type LoadReport } from './load-metrics.ts';
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
    let cycle = 0;

    while (!signal?.aborted && this.now().getTime() < deadline) {
      const cycleStartedAt = this.now().getTime();
      const jobs = this.units
        .map((unit) => ({
          unit,
          offsetMs: deterministicOffset(
            `${this.config.seed}:${unit.id}:${cycle}`,
            this.config.intervalSeconds * 1000,
          ),
        }))
        .sort((left, right) => left.offsetMs - right.offsetMs || left.unit.id.localeCompare(right.unit.id));

      await runConcurrent(jobs, this.config.concurrency, async ({ unit, offsetMs }) => {
        await waitUntil(cycleStartedAt + offsetMs, this.now, this.sleep, signal);
        if (signal?.aborted || this.now().getTime() >= deadline) return;

        const snapshot = this.state.snapshotFor(unit, this.now());
        const sourceId = this.sourceIdFor(unit.id);
        const sentAt = this.now().getTime();
        metrics.recordGenerated();
        try {
          const result = await this.send(snapshot, sourceId, signal);
          metrics.recordResult(result, this.now().getTime() - sentAt);
        } catch (error) {
          if (signal?.aborted) return;
          metrics.recordError(error);
        }
      });

      cycle += 1;
      this.state.advance(this.units, cycle);
      const currentTime = this.now().getTime();
      if (currentTime >= nextReportAt) {
        this.onReport?.(metrics.snapshot());
        nextReportAt = currentTime + this.config.reportIntervalSeconds * 1000;
      }
      if (currentTime < deadline) {
        await waitUntil(cycleStartedAt + this.config.intervalSeconds * 1000, this.now, this.sleep, signal);
      }
    }

    const report = metrics.snapshot();
    this.onReport?.(report);
    return report;
  }

  private sourceIdFor(unitCnes: string): string {
    const digest = createHash('sha256')
      .update(`${this.config.seed}:${unitCnes}`)
      .digest();
    const index = digest.readUInt32BE(0) % this.config.sourceIds.length;
    return this.config.sourceIds[index]!;
  }
}

async function runConcurrent<T>(
  jobs: readonly T[],
  concurrency: number,
  job: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      await job(jobs[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
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

function deterministicOffset(seed: string, maximum: number): number {
  if (maximum <= 0) return 0;
  return createHash('sha256').update(seed).digest().readUInt32BE(0) % maximum;
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
