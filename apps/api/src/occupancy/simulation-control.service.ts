import { Injectable } from '@nestjs/common';
import { SimulationControlRepository } from '../database/repositories/simulation-control.repository.js';
import {
  DEFAULT_SIMULATION_SCENARIO,
  SIMULATION_SCENARIOS,
  type SimulationScenarioId,
} from './simulation-scenarios.js';

/** Any visitor may change the scenario, so changes are spaced out. */
export const SCENARIO_COOLDOWN_MS = 15_000;
/** A chosen scenario returns to the default after this long. */
export const SCENARIO_DURATION_MS = 15 * 60_000;

export interface SimulationControlResponse {
  data: {
    scenario: SimulationScenarioId;
    /** When the scenario was chosen; `null` for the default. */
    changedAt: string | null;
    /** When it returns to the default; `null` for the default. */
    expiresAt: string | null;
    /** Until when a new change is refused. */
    nextChangeAt: string | null;
    scenarios: typeof SIMULATION_SCENARIOS;
  };
  metadata: { simulated: true; defaultScenario: SimulationScenarioId };
}

export type ChangeResult =
  | { status: 'changed'; response: SimulationControlResponse }
  | { status: 'cooldown'; retryAfterSeconds: number };

@Injectable()
export class SimulationControlService {
  constructor(private readonly repository: SimulationControlRepository) {}

  async find(now = new Date()): Promise<SimulationControlResponse> {
    const control = await this.repository.find();
    return this.toResponse(control, now);
  }

  async change(
    scenario: SimulationScenarioId,
    now = new Date(),
  ): Promise<ChangeResult> {
    const changed = await this.repository.change(
      scenario,
      now,
      new Date(now.getTime() + SCENARIO_DURATION_MS),
      new Date(now.getTime() - SCENARIO_COOLDOWN_MS),
    );
    if (changed) {
      return { status: 'changed', response: this.toResponse(changed, now) };
    }

    const current = await this.repository.find();
    const nextChangeAt =
      (current?.changedAt.getTime() ?? now.getTime()) + SCENARIO_COOLDOWN_MS;
    return {
      status: 'cooldown',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((nextChangeAt - now.getTime()) / 1000),
      ),
    };
  }

  private toResponse(
    control: { scenario: string; changedAt: Date; expiresAt: Date } | null,
    now: Date,
  ): SimulationControlResponse {
    const active =
      control &&
      control.expiresAt.getTime() > now.getTime() &&
      SIMULATION_SCENARIOS.some(({ id }) => id === control.scenario)
        ? control
        : null;
    const nextChangeAt = control
      ? control.changedAt.getTime() + SCENARIO_COOLDOWN_MS
      : 0;

    return {
      data: {
        scenario: (active?.scenario ??
          DEFAULT_SIMULATION_SCENARIO) as SimulationScenarioId,
        changedAt: active?.changedAt.toISOString() ?? null,
        expiresAt: active?.expiresAt.toISOString() ?? null,
        nextChangeAt:
          nextChangeAt > now.getTime()
            ? new Date(nextChangeAt).toISOString()
            : null,
        scenarios: SIMULATION_SCENARIOS,
      },
      metadata: {
        simulated: true,
        defaultScenario: DEFAULT_SIMULATION_SCENARIO,
      },
    };
  }
}
