import { Injectable, Logger } from '@nestjs/common';
import { HealthUnitEntity } from '../database/entities/health-unit.entity.js';
import { HealthUnitRepository } from '../database/repositories/health-unit.repository.js';
import { CnesClient } from '../units/cnes.client.js';
import type { BrazilianState } from '../units/states.js';
import type { HealthUnit } from '../units/units.types.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;
const STALE_AFTER_DAYS = 30;
const CNES_SOURCE_NAME =
  'Cadastro Nacional de Estabelecimentos de Saúde (CNES)';

export interface StateIngestionResult {
  state: string;
  imported: number;
  deactivated: number;
  latestSourceUpdate: string;
}

export interface StateIngestionFailure {
  state: string;
  reason: string;
}

export class UnitsIngestionError extends Error {
  constructor(
    readonly completed: StateIngestionResult[],
    readonly failures: StateIngestionFailure[],
  ) {
    super(
      `Unit ingestion failed for ${failures.map(({ state }) => state).join(', ')}`,
    );
  }
}

interface RunOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message || error.name : String(error);
}

function latestUpdate(units: readonly HealthUnit[]): string {
  return units.reduce(
    (latest, unit) =>
      unit.lastUpdatedAt > latest ? unit.lastUpdatedAt : latest,
    '',
  );
}

function fit(value: string | null, maximumLength: number): string | null {
  return value?.slice(0, maximumLength) ?? null;
}

function postalCode(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return /^\d{8}$/.test(digits) ? digits : null;
}

function toEntity(unit: HealthUnit, ingestedAt: Date): HealthUnitEntity {
  const source = unit.sources.find(({ name }) => name === CNES_SOURCE_NAME);
  if (!source) throw new Error(`Unit ${unit.id} has no CNES source`);

  return Object.assign(new HealthUnitEntity(), {
    cnesCode: unit.id,
    name: unit.name.slice(0, 255),
    unitType: unit.unitType,
    street: fit(unit.address.street, 255),
    number: fit(unit.address.number, 32),
    district: fit(unit.address.district, 128),
    postalCode: postalCode(unit.address.postalCode),
    city: unit.address.city.slice(0, 128),
    state: unit.address.state,
    latitude: unit.location.latitude,
    longitude: unit.location.longitude,
    serviceHours: unit.serviceHours,
    sourceName: source.name,
    sourceUrl: source.url,
    sourceUpdatedAt: unit.lastUpdatedAt,
    ingestedAt,
    isActive: true,
  });
}

@Injectable()
export class UnitsIngestionService {
  private readonly logger = new Logger(UnitsIngestionService.name);

  constructor(
    private readonly cnes: CnesClient,
    private readonly units: HealthUnitRepository,
  ) {}

  /**
   * Ingests states independently. Successful states are committed even when
   * another state fails, and the caller still receives a failing exit status.
   */
  async run(
    states: readonly BrazilianState[],
    options: RunOptions = {},
  ): Promise<StateIngestionResult[]> {
    const completed: StateIngestionResult[] = [];
    const failures: StateIngestionFailure[] = [];
    const sleep = options.sleep ?? wait;
    const now = options.now ?? (() => new Date());

    for (const state of states) {
      try {
        const fetched = await this.fetchWithRetry(state, sleep);
        if (fetched.length === 0) {
          throw new Error('CNES returned an empty state catalog');
        }

        const ingestedAt = now();
        const { deactivated } = await this.units.replaceState(
          state.abbreviation,
          fetched.map((unit) => toEntity(unit, ingestedAt)),
        );
        const result = {
          state: state.abbreviation,
          imported: fetched.length,
          deactivated,
          latestSourceUpdate: latestUpdate(fetched),
        };
        completed.push(result);
        this.warnIfStale(result, ingestedAt);
        this.logger.log(
          `${state.abbreviation}: imported=${result.imported} deactivated=${deactivated} latestSourceUpdate=${result.latestSourceUpdate}`,
        );
      } catch (error: unknown) {
        const reason = reasonOf(error);
        failures.push({ state: state.abbreviation, reason });
        this.logger.error(`${state.abbreviation}: ingestion failed: ${reason}`);
      }
    }

    if (failures.length > 0) {
      throw new UnitsIngestionError(completed, failures);
    }
    return completed;
  }

  private async fetchWithRetry(
    state: BrazilianState,
    sleep: (milliseconds: number) => Promise<void>,
  ): Promise<HealthUnit[]> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.cnes.fetchUnits(state);
      } catch (error: unknown) {
        if (attempt === MAX_ATTEMPTS) throw error;
        const delay = RETRY_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `${state.abbreviation}: CNES attempt ${attempt}/${MAX_ATTEMPTS} failed: ${reasonOf(error)}; retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
    throw new Error('Unreachable retry state');
  }

  private warnIfStale(result: StateIngestionResult, now: Date): void {
    const sourceTime = Date.parse(`${result.latestSourceUpdate}T00:00:00Z`);
    const ageDays = (now.getTime() - sourceTime) / (24 * 60 * 60 * 1_000);
    if (!Number.isFinite(sourceTime) || ageDays > STALE_AFTER_DAYS) {
      this.logger.warn(
        `${result.state}: latest CNES update is stale (${result.latestSourceUpdate})`,
      );
    }
  }
}
