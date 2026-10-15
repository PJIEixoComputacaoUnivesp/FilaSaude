import type { SimulatorUnit } from './units.ts';
import type { SimulatorConfig } from './config.ts';
import { SimulationState, type OccupancySnapshot } from './simulation.ts';
import { sendSnapshot, type SnapshotTransportResult } from './transport.ts';

export interface SimulationRunnerOptions {
  now?: () => Date;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  send?: (
    snapshot: OccupancySnapshot,
    signal?: AbortSignal,
  ) => Promise<SnapshotTransportResult>;
  onSnapshotSent?: (
    snapshot: OccupancySnapshot,
    result: SnapshotTransportResult,
  ) => void;
}

export class SimulationRunner {
  private readonly config: SimulatorConfig;
  private readonly units: readonly SimulatorUnit[];
  private readonly state: SimulationState;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly send: (
    snapshot: OccupancySnapshot,
    signal?: AbortSignal,
  ) => Promise<SnapshotTransportResult>;
  private readonly onSnapshotSent?: SimulationRunnerOptions['onSnapshotSent'];

  constructor(
    config: SimulatorConfig,
    units: readonly SimulatorUnit[],
    state: SimulationState,
    options: SimulationRunnerOptions = {},
  ) {
    this.config = config;
    this.units = units;
    this.state = state;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? delay;
    this.send =
      options.send ??
      ((snapshot, signal) => sendSnapshot(snapshot, { ...config, signal }));
    this.onSnapshotSent = options.onSnapshotSent;
  }

  async run(signal?: AbortSignal): Promise<void> {
    let cycle = 0;

    while (!signal?.aborted) {
      const observedAt = this.now();
      for (const unit of this.units) {
        if (signal?.aborted) return;
        const snapshot = this.state.snapshotFor(
          unit,
          new Date(observedAt.getTime() - this.config.delaySeconds * 1000),
        );
        let result: SnapshotTransportResult;
        try {
          result = await this.send(snapshot, signal);
        } catch (error) {
          if (signal?.aborted) return;
          throw error;
        }
        if (signal?.aborted) return;
        this.onSnapshotSent?.(snapshot, result);
        if (cycle === 0 && this.config.scenario === 'duplicate') {
          let duplicateResult: SnapshotTransportResult;
          try {
            duplicateResult = await this.send(snapshot, signal);
          } catch (error) {
            if (signal?.aborted) return;
            throw error;
          }
          if (signal?.aborted) return;
          this.onSnapshotSent?.(snapshot, duplicateResult);
        }
      }

      cycle += 1;
      this.state.advance(this.units, cycle);
      if (signal?.aborted) return;
      try {
        await this.sleep(this.config.intervalSeconds * 1000, signal);
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }
    }
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
