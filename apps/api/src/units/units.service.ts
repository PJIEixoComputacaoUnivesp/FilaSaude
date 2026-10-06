import { Injectable, Logger } from '@nestjs/common';
import snapshot from './units.snapshot.json' with { type: 'json' };
import { CnesClient } from './cnes.client.js';
import { GeoSampaClient } from './geosampa.client.js';
import {
  NationalStateCode,
  parseState,
  type BrazilianState,
} from './states.js';
import type { HealthUnit, UnitsResponse } from './units.types.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_RETRIEVED_AT = '2026-09-24T00:00:00-03:00';
export const CNES_SOURCE_URL =
  'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const CNES_DATASET_URL =
  'https://dadosabertos.saude.gov.br/dataset/cnes-cadastro-nacional-de-estabelecimentos-de-saude';

function latestUpdate(units: readonly HealthUnit[]): string {
  return units.reduce(
    (latest, unit) =>
      unit.lastUpdatedAt > latest ? unit.lastUpdatedAt : latest,
    '',
  );
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
      city: unit.address.city,
      state: unit.address.state,
    },
    location: {
      latitude: unit.location.latitude ?? null,
      longitude: unit.location.longitude ?? null,
    },
    serviceHours: unit.serviceHours ?? null,
    lastUpdatedAt: unit.lastUpdatedAt,
    sources: [
      {
        name: 'Cadastro Nacional de Estabelecimentos de Saúde (CNES)',
        url: CNES_DATASET_URL,
        fields: ['identity', 'address', 'location', 'serviceHours'],
        lastUpdatedAt: unit.lastUpdatedAt,
      },
    ],
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

  constructor(
    private readonly cnesClient: CnesClient,
    private readonly geoSampaClient: GeoSampaClient,
  ) {}

  async findAll(stateValue?: string): Promise<UnitsResponse> {
    const state = parseState(stateValue);
    const cached = this.cache.get(state.abbreviation);
    if (cached && cached.expiresAt > Date.now()) return cached.response;

    if (state.abbreviation === NationalStateCode.Brazil) {
      const units = fallbackUnits(NationalStateCode.Brazil);
      const response = this.buildResponse(
        units,
        state,
        'fallback',
        FALLBACK_RETRIEVED_AT,
      );
      this.cache.set(state.abbreviation, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        response,
      });
      return response;
    }

    let request = this.pending.get(state.abbreviation);
    if (!request) {
      request = this.loadLive(state, cached).finally(() => {
        this.pending.delete(state.abbreviation);
      });
      this.pending.set(state.abbreviation, request);
    }

    return request;
  }

  private async loadLive(
    state: BrazilianState,
    cached?: { expiresAt: number; response: UnitsResponse },
  ): Promise<UnitsResponse> {
    try {
      let units = await this.cnesClient.fetchUnits(state);
      if (units.length === 0) {
        throw new Error('CNES returned no public urgent care units');
      }

      if (state.abbreviation === 'SP') {
        try {
          units = await this.geoSampaClient.enrichLocations(units);
        } catch (error: unknown) {
          const reason =
            error instanceof Error ? error.message : 'unknown error';
          this.logger.warn(
            `GeoSampa enrichment failed; keeping CNES locations: ${reason}`,
          );
        }
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

      const fallback = fallbackUnits(state.abbreviation);
      if (fallback.length > 0) {
        this.logger.warn(
          `Using the CNES fallback snapshot for ${state.abbreviation}`,
        );
        return this.buildResponse(
          fallback,
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
