import type { SimulatorUnit } from './units.ts';
import type { SimulationScenario, SimulatorConfig } from './config.ts';
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
  /**
   * Reads the scenario chosen on the site (`null` when there is none). When
   * given, the runner checks it every `controlPollMs` while it waits and
   * starts a new cycle as soon as the choice changes.
   */
  readScenario?: (signal?: AbortSignal) => Promise<SimulationScenario | null>;
  controlPollMs?: number;
  onScenarioChanged?: (scenario: SimulationScenario) => void;
}

const DEFAULT_CONTROL_POLL_MS = 10_000;
/**
 * A new choice on the site starts a cycle early, but never sooner than this
 * after the previous one: quick changes would otherwise go past the webhook
 * limit of 60 requests per minute per source.
 */
const MIN_CYCLE_GAP_MS = 30_000;
/** Share of the capacity a `surge` adds per cycle, up to its ceiling. */
const SURGE_STEP = 0.1;
const SURGE_CEILING = 0.95;

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
  private readonly readScenario?: SimulationRunnerOptions['readScenario'];
  private readonly controlPollMs: number;
  private readonly onScenarioChanged?: SimulationRunnerOptions['onScenarioChanged'];
  private scenario: SimulationScenario;
  private roles: ReadonlyMap<string, ShowcaseRole> = new Map();
  /** Values sent per unit, kept long enough to resend one as a late event. */
  private readonly sent = new Map<
    string,
    { at: number; categories: OccupancySnapshot['categories'] }[]
  >();

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
    this.readScenario = options.readScenario;
    this.controlPollMs = options.controlPollMs ?? DEFAULT_CONTROL_POLL_MS;
    this.onScenarioChanged = options.onScenarioChanged;
    this.scenario = config.scenario;
    this.applyScenario(config.scenario);
  }

  get currentScenario(): SimulationScenario {
    return this.scenario;
  }

  private applyScenario(scenario: SimulationScenario): void {
    this.scenario = scenario;
    this.roles = scenario === 'showcase' ? showcaseRoles(this.units) : new Map();
  }

  /** Follows the site's choice; a failed read keeps the current scenario. */
  private async followSite(signal?: AbortSignal): Promise<boolean> {
    if (!this.readScenario) return false;
    let next: SimulationScenario | null;
    try {
      next = await this.readScenario(signal);
    } catch {
      return false;
    }
    if (next === null || next === this.scenario) return false;
    this.applyScenario(next);
    this.onScenarioChanged?.(next);
    return true;
  }

  async run(signal?: AbortSignal): Promise<void> {
    let cycle = 0;
    await this.followSite(signal);

    while (!signal?.aborted) {
      if (!(await this.sendCycle(cycle, signal))) return;
      cycle += 1;
      // A surge only goes up; the random walk would undo part of each step.
      if (this.scenario !== 'surge') this.state.advance(this.units, cycle);
      if (signal?.aborted) return;
      try {
        await this.wait(signal);
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }
    }
  }

  /** Waits for the next cycle, or less if the site picks another scenario. */
  private async wait(signal?: AbortSignal): Promise<void> {
    const interval = this.config.intervalSeconds * 1000;
    if (!this.readScenario) {
      await this.sleep(interval, signal);
      return;
    }
    let remaining = interval;
    while (remaining > 0) {
      const chunk = Math.min(this.controlPollMs, remaining);
      await this.sleep(chunk, signal);
      if (signal?.aborted) return;
      remaining -= chunk;
      if (await this.followSite(signal)) {
        const waited = interval - remaining;
        if (waited < MIN_CYCLE_GAP_MS) {
          await this.sleep(MIN_CYCLE_GAP_MS - waited, signal);
        }
        return;
      }
    }
  }

  /** Sends one cycle; `false` when it was cancelled. */
  private async sendCycle(cycle: number, signal?: AbortSignal): Promise<boolean> {
    // The source is down: nothing is sent, so the units stop confirming.
    if (this.scenario === 'outage') return true;

    const observedAt = this.now();
    for (const [index, unit] of this.units.entries()) {
      if (signal?.aborted) return false;
      const role = this.roles.get(unit.id);
      if (role?.kind === 'intermittent' && isSilent(observedAt)) continue;
      if (role?.kind === 'fixed') this.state.setRatio(unit.id, role.ratio);
      if (this.scenario === 'surge') {
        this.state.raise(unit.id, SURGE_STEP, SURGE_CEILING);
      }
      const snapshot = this.state.snapshotFor(
        unit,
        new Date(observedAt.getTime() - this.config.delaySeconds * 1000),
      );
      // Replay only on every other unit: three requests per unit would go
      // past the webhook rate limit with the whole sample.
      const replays = this.scenario === 'replay' && index % 2 === 0;
      const extras: OccupancySnapshot[] = [];
      if (
        (cycle === 0 && this.scenario === 'duplicate') ||
        role?.kind === 'duplicate' ||
        replays
      ) {
        extras.push(snapshot);
      }
      if (role?.kind === 'late' || replays) {
        const late = this.lateSnapshot(unit, observedAt);
        if (late) extras.push(late);
      }
      this.remember(unit.id, snapshot);

      for (const item of [snapshot, ...extras]) {
        let result: SnapshotTransportResult;
        try {
          result = await this.send(item, signal);
        } catch (error) {
          if (signal?.aborted) return false;
          throw error;
        }
        if (signal?.aborted) return false;
        this.onSnapshotSent?.(item, result);
      }
    }
    return true;
  }

  private remember(unitCnes: string, snapshot: OccupancySnapshot): void {
    const at = Date.parse(snapshot.observedAt);
    const kept = (this.sent.get(unitCnes) ?? []).filter(
      (entry) => at - entry.at <= 2 * LATE_EVENT_DELAY_MS,
    );
    kept.push({ at, categories: snapshot.categories });
    this.sent.set(unitCnes, kept);
  }

  /**
   * A late event resends, with a new eventId, the values the unit really had
   * about LATE_EVENT_DELAY_MS ago, so the history never shows a value at a
   * time it did not hold. Until there is such a past value, nothing is sent.
   */
  private lateSnapshot(
    unit: SimulatorUnit,
    observedAt: Date,
  ): OccupancySnapshot | null {
    const target = observedAt.getTime() - LATE_EVENT_DELAY_MS;
    const past = (this.sent.get(unit.id) ?? []).filter(
      (entry) => entry.at <= target,
    );
    const entry = past[past.length - 1];
    return entry
      ? this.state.snapshotOf(unit, entry.categories, new Date(entry.at))
      : null;
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
