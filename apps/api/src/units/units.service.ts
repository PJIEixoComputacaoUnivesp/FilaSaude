import { Injectable, Logger } from '@nestjs/common';
import snapshot from './units.snapshot.json' with { type: 'json' };
import { CnesClient } from './cnes.client.js';
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
    unitType: 'PRONTO ATENDIMENTO',
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
  private cache: { expiresAt: number; response: UnitsResponse } | null = null;

  constructor(private readonly cnesClient: CnesClient) {}

  async findAll(): Promise<UnitsResponse> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.response;
    }

    try {
      const units = await this.cnesClient.fetchUnits();
      if (units.length === 0) {
        throw new Error('CNES returned no public urgent care units');
      }

      const response = this.buildResponse(
        units,
        'live',
        new Date().toISOString(),
      );
      this.cache = { expiresAt: Date.now() + CACHE_TTL_MS, response };
      return response;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Using the CNES fallback snapshot: ${reason}`);
      return this.buildResponse(
        fallbackUnits(),
        'fallback',
        FALLBACK_RETRIEVED_AT,
      );
    }
  }

  private buildResponse(
    units: HealthUnit[],
    dataOrigin: 'live' | 'fallback',
    retrievedAt: string,
  ): UnitsResponse {
    return {
      data: units,
      metadata: {
        count: units.length,
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
