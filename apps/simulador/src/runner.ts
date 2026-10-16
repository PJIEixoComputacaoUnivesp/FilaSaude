import type { SimulatorUnit } from './units.ts';
import type { SimulatorConfig } from './config.ts';
import { SimulationState, type OccupancySnapshot } from './simulation.ts';
import { sendSnapshot, type SnapshotTransportResult } from './transport.ts';
import {
  isSilent,
  LATE_EVENT_DELAY_MS,
  showcaseRoles,
  type ShowcaseRole,
} from './showcase.ts';

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
  private readonly roles: ReadonlyMap<string, ShowcaseRole>;

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
    this.roles = config.scenario === 'showcase' ? showcaseRoles(units) : new Map();
  }

  async run(signal?: AbortSignal): Promise<void> {
    let cycle = 0;

    while (!signal?.aborted) {
      const observedAt = this.now();
      for (const unit of this.units) {
        if (signal?.aborted) return;
        const role = this.roles.get(unit.id);
        if (role?.kind === 'intermittent' && isSilent(observedAt)) continue;
        if (role?.kind === 'fixed') this.state.setRatio(unit.id, role.ratio);
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
        const extra =
          (cycle === 0 && this.config.scenario === 'duplicate') ||
          role?.kind === 'duplicate'
            ? snapshot
            : role?.kind === 'late'
              ? this.state.snapshotFor(
                  unit,
                  new Date(observedAt.getTime() - LATE_EVENT_DELAY_MS),
                )
              : null;
        if (extra) {
          let extraResult: SnapshotTransportResult;
          try {
            extraResult = await this.send(extra, signal);
          } catch (error) {
            if (signal?.aborted) return;
            throw error;
          }
          if (signal?.aborted) return;
          this.onSnapshotSent?.(extra, extraResult);
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
