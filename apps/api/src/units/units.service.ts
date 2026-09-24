import { Injectable, Logger } from '@nestjs/common';
import snapshot from './units.snapshot.json' with { type: 'json' };
import { CnesClient } from './cnes.client.js';
import { parseState, type BrazilianState } from './states.js';
import type { HealthUnit, UnitsResponse } from './units.types.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
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

function fallbackUnits(): HealthUnit[] {
  return snapshot.map((unit) => ({
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
      city: unit.address.city,
      state: unit.address.state,
    },
    location: {
      latitude: unit.location.latitude ?? null,
      longitude: unit.location.longitude ?? null,
    },
    serviceHours: unit.serviceHours ?? null,
    lastUpdatedAt: unit.lastUpdatedAt,
  }));
}

@Injectable()
export class UnitsService {
  private readonly logger = new Logger(UnitsService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; response: UnitsResponse }
  >();

  constructor(private readonly cnesClient: CnesClient) {}

  async findAll(stateValue: string): Promise<UnitsResponse> {
    const state = parseState(stateValue);
    const cached = this.cache.get(state.abbreviation);
    if (cached && cached.expiresAt > Date.now()) return cached.response;

    try {
      const units = await this.cnesClient.fetchUnits(state);
      if (units.length === 0) {
        throw new Error('CNES returned no public urgent care units');
      }

      const response = this.buildResponse(
        units,
        state,
        'live',
        new Date().toISOString(),
      );
      this.cache.set(state.abbreviation, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        response,
      });
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

      if (state.abbreviation !== 'SP') throw error;

      this.logger.warn('Using the CNES fallback snapshot for SP');
      return this.buildResponse(
        fallbackUnits(),
        state,
        'fallback',
        FALLBACK_RETRIEVED_AT,
      );
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
