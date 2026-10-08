import { Injectable, Logger } from '@nestjs/common';
import snapshot from './units.snapshot.json' with { type: 'json' };
import { CnesClient } from './cnes.client.js';
import { UnitLocationsService } from './unit-locations.service.js';
import {
  NationalStateCode,
  parseState,
  type BrazilianState,
} from './states.js';
import type { HealthUnit, UnitsResponse } from './units.types.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Units whose coordinates could not be validated are checked again soon.
const UNVALIDATED_CACHE_TTL_MS = 5 * 60 * 1000;
// A failed history lookup only affects the few units with an invalid
// coordinate, which keep the municipality center meanwhile, so retrying it
// does not justify refetching the whole list every few minutes.
const INCOMPLETE_HISTORY_CACHE_TTL_MS = 60 * 60 * 1000;
const FALLBACK_RETRIEVED_AT = '2026-09-24T00:00:00-03:00';
export const CNES_SOURCE_URL =
  'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';

function latestUpdate(units: readonly HealthUnit[]): string {
  return units.reduce(
    (latest, unit) =>
      unit.lastUpdatedAt > latest ? unit.lastUpdatedAt : latest,
    '',
  );
}

function cacheTtl(located: {
  validated: boolean;
  historyComplete: boolean;
}): number {
  if (!located.validated) return UNVALIDATED_CACHE_TTL_MS;
  return located.historyComplete
    ? CACHE_TTL_MS
    : INCOMPLETE_HISTORY_CACHE_TTL_MS;
}

function fallbackUnits(stateAbbr?: string): HealthUnit[] {
  const units: HealthUnit[] = snapshot.map((unit) => ({
    id: unit.id,
    name: unit.name,
    unitType: unit.unitType as HealthUnit['unitType'],
    address: {
      street: 'street' in unit.address ? (unit.address.street ?? null) : null,
      number: 'number' in unit.address ? (unit.address.number ?? null) : null,
      district:
        'district' in unit.address ? (unit.address.district ?? null) : null,
      postalCode:
        'postalCode' in unit.address ? (unit.address.postalCode ?? null) : null,
      municipalityCode: unit.address.municipalityCode,
      city: unit.address.city,
      state: unit.address.state,
    },
    location: {
      latitude: unit.location.latitude ?? null,
      longitude: unit.location.longitude ?? null,
      precision: 'source',
      original: null,
      referenceMonth: null,
      correctedAt: null,
    },
    serviceHours: unit.serviceHours ?? null,
    lastUpdatedAt: unit.lastUpdatedAt,
  }));

  if (!stateAbbr || stateAbbr === NationalStateCode.Brazil) {
    return units;
  }
  return units.filter((unit) => unit.address.state === stateAbbr);
}

@Injectable()
export class UnitsService {
  private readonly logger = new Logger(UnitsService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; response: UnitsResponse }
  >();
  private readonly pending = new Map<string, Promise<UnitsResponse>>();
  // Bumped by `invalidate`, so that a load started before it does not put its
  // outdated response back in the cache. It is kept per key: a correction for a
  // unit in one state must not keep a slow load of another state from being
  // cached.
  private epoch = 0;
  private readonly keyGeneration = new Map<string, number>();

  constructor(
    private readonly cnesClient: CnesClient,
    private readonly locations: UnitLocationsService,
  ) {}

  /**
   * Drops the cached and in-flight responses a change to the positions (a
   * manual correction) can affect, so that it shows on the next request: the
   * state of the unit and the national view. Other states keep theirs, since
   * refetching one from CNES takes tens of seconds. Without a state, all of
   * them go.
   *
   * The entries are dropped, not kept as a stale fallback: if CNES is down
   * right after a removal, the embedded snapshot still goes through the
   * current corrections, while a stale response would keep serving the
   * removed position.
   */
  invalidate(state?: string): void {
    if (!state) {
      this.epoch++;
      this.cache.clear();
      this.pending.clear();
      return;
    }
    for (const key of [state, NationalStateCode.Brazil]) {
      this.keyGeneration.set(key, (this.keyGeneration.get(key) ?? 0) + 1);
      this.cache.delete(key);
      this.pending.delete(key);
    }
  }

  private generationOf(key: string): string {
    return `${this.epoch}:${this.keyGeneration.get(key) ?? 0}`;
  }

  async findAll(stateValue?: string): Promise<UnitsResponse> {
    const state = parseState(stateValue);
    const generation = this.generationOf(state.abbreviation);
    const cached = this.cache.get(state.abbreviation);
    if (cached && cached.expiresAt > Date.now()) return cached.response;

    // Concurrent requests for the same key share a single load.
    let request = this.pending.get(state.abbreviation);
    if (!request) {
      request = (
        state.abbreviation === NationalStateCode.Brazil
          ? this.loadNational(state, generation)
          : this.loadLive(state, generation, cached)
      ).finally(() => {
        // An invalidation may already have replaced this entry.
        if (this.pending.get(state.abbreviation) === request) {
          this.pending.delete(state.abbreviation);
        }
      });
      this.pending.set(state.abbreviation, request);
    }

    return request;
  }

  /**
   * The national view is served from the embedded snapshot, which keeps the
   * CNES coordinates as they were collected. Their position is still checked
   * against the municipality, like any other response, so that a misplaced
   * unit does not appear outside it.
   */
  private async loadNational(
    state: BrazilianState,
    generation: string,
  ): Promise<UnitsResponse> {
    const located = await this.locations.apply(
      fallbackUnits(NationalStateCode.Brazil),
    );
    const response = this.buildResponse(
      located.units,
      state,
      'fallback',
      FALLBACK_RETRIEVED_AT,
    );
    this.remember(state.abbreviation, generation, cacheTtl(located), response);
    return response;
  }

  private remember(
    key: string,
    generation: string,
    ttlMs: number,
    response: UnitsResponse,
  ): void {
    if (generation !== this.generationOf(key)) return;
    this.cache.set(key, { expiresAt: Date.now() + ttlMs, response });
  }

  private async loadLive(
    state: BrazilianState,
    generation: string,
    cached?: { expiresAt: number; response: UnitsResponse },
  ): Promise<UnitsResponse> {
    try {
      const units = await this.cnesClient.fetchUnits(state);
      if (units.length === 0) {
        throw new Error('CNES returned no public urgent care units');
      }

      const located = await this.locations.apply(units);
      const response = this.buildResponse(
        located.units,
        state,
        'live',
        new Date().toISOString(),
      );
      this.remember(
        state.abbreviation,
        generation,
        cacheTtl(located),
        response,
      );
      return response;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `CNES request failed for ${state.abbreviation}: ${reason}`,
      );

      if (cached) {
        this.logger.warn(
          `Using the last live CNES response for ${state.abbreviation}`,
        );
        return {
          ...cached.response,
          metadata: { ...cached.response.metadata, isStale: true },
        };
      }

      const fallback = fallbackUnits(state.abbreviation);
      if (fallback.length > 0) {
        this.logger.warn(
          `Using the CNES fallback snapshot for ${state.abbreviation}`,
        );
        // CNES is already unreachable, so its history would be as well.
        const located = await this.locations.apply(fallback, {
          history: false,
        });
        return this.buildResponse(
          located.units,
          state,
          'fallback',
          FALLBACK_RETRIEVED_AT,
        );
      }

      throw error;
    }
  }

  private buildResponse(
    units: HealthUnit[],
    state: BrazilianState,
    dataOrigin: 'live' | 'fallback',
    retrievedAt: string,
  ): UnitsResponse {
    return {
      data: units,
      metadata: {
        count: units.length,
        state: state.abbreviation,
        dataOrigin,
        isStale: dataOrigin === 'fallback',
        retrievedAt,
        latestSourceUpdate: latestUpdate(units),
        source: {
          name: 'Cadastro Nacional de Estabelecimentos de Saúde (CNES)',
          url: CNES_SOURCE_URL,
        },
      },
    };
  }
}
