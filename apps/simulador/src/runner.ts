import type { SimulatorUnit } from './units.ts';
import type { SimulatorConfig } from './config.ts';
import { SimulationState, type OccupancySnapshot } from './simulation.ts';
import { sendSnapshot, type SnapshotTransportResult } from './transport.ts';

export interface SimulationRunnerOptions {
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  send?: (snapshot: OccupancySnapshot) => Promise<SnapshotTransportResult>;
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
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly send: (snapshot: OccupancySnapshot) => Promise<SnapshotTransportResult>;
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
    this.send = options.send ?? ((snapshot) => sendSnapshot(snapshot, config));
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
        const result = await this.send(snapshot);
        this.onSnapshotSent?.(snapshot, result);
        if (cycle === 0 && this.config.scenario === 'duplicate') {
          const duplicateResult = await this.send(snapshot);
          this.onSnapshotSent?.(snapshot, duplicateResult);
        }
      }

      cycle += 1;
      this.state.advance(this.units, cycle);
      if (signal?.aborted) return;
      await this.sleep(this.config.intervalSeconds * 1000);
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
