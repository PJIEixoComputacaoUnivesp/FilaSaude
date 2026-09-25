import { Injectable } from '@nestjs/common';
import { MunicipalitiesClient } from './municipalities.client.js';
import { stateAbbreviation, type BrazilianState } from './states.js';
import type { HealthUnit } from './units.types.js';

const CNES_API_URL =
  'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const PAGE_SIZE = 20;
const MAX_PAGES = 300;
const PAGE_BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const STATE_FETCH_DEADLINE_MS = 30_000;
const NATIONAL_FETCH_DEADLINE_MS = 45_000;
const unitTypes = new Map<number, HealthUnit['unitType']>([
  [20, 'PRONTO SOCORRO GERAL'],
  [21, 'PRONTO SOCORRO ESPECIALIZADO'],
  [73, 'PRONTO ATENDIMENTO'],
]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalCoordinate(
  record: JsonRecord,
  key: string,
  limit: number,
): number | null {
  const value = optionalNumber(record, key);
  return value !== null && Math.abs(value) <= limit ? value : null;
}

function requiredString(record: JsonRecord, key: string): string {
  const value = optionalString(record, key);
  if (!value) throw new Error(`CNES returned an invalid ${key}`);
  return value;
}

function numericId(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`CNES returned an invalid ${key}`);
  }
  return String(value);
}

function parsePage(payload: unknown): JsonRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload.estabelecimentos)) {
    throw new Error('CNES returned an unexpected response');
  }
  if (!payload.estabelecimentos.every(isRecord)) {
    throw new Error('CNES returned an invalid establishment');
  }
  return payload.estabelecimentos;
}

function normalizeUnit(
  record: JsonRecord,
  municipalities: ReadonlyMap<string, string>,
): HealthUnit | null {
  if (record.estabelecimento_faz_atendimento_ambulatorial_sus !== 'SIM') {
    return null;
  }

  const unitType = unitTypes.get(
    Number(numericId(record, 'codigo_tipo_unidade')),
  );
  if (!unitType) throw new Error('CNES returned an unknown unit type');

  const city = municipalities.get(numericId(record, 'codigo_municipio'));
  if (!city) throw new Error('CNES returned an unknown municipality');

  const state = stateAbbreviation(numericId(record, 'codigo_uf'));
  if (!state) throw new Error('CNES returned an unknown state');

  return {
    id: numericId(record, 'codigo_cnes').padStart(7, '0'),
    name: requiredString(record, 'nome_fantasia'),
    unitType,
    address: {
      street: optionalString(record, 'endereco_estabelecimento'),
      number: optionalString(record, 'numero_estabelecimento'),
      district: optionalString(record, 'bairro_estabelecimento'),
      postalCode: optionalString(record, 'codigo_cep_estabelecimento'),
      city,
      state,
    },
    location: {
      latitude: optionalCoordinate(
        record,
        'latitude_estabelecimento_decimo_grau',
        90,
      ),
      longitude: optionalCoordinate(
        record,
        'longitude_estabelecimento_decimo_grau',
        180,
      ),
    },
    serviceHours: optionalString(record, 'descricao_turno_atendimento'),
    lastUpdatedAt: requiredString(record, 'data_atualizacao'),
  };
}

@Injectable()
export class CnesClient {
  constructor(private readonly municipalitiesClient: MunicipalitiesClient) {}

  /** Fetches the units of one state, or of the whole country when state is null. */
  async fetchUnits(state: BrazilianState | null): Promise<HealthUnit[]> {
    const deadline = AbortSignal.timeout(
      state ? STATE_FETCH_DEADLINE_MS : NATIONAL_FETCH_DEADLINE_MS,
    );
    const [recordsByType, municipalities] = await Promise.all([
      Promise.all(
        [...unitTypes.keys()].map((unitType) =>
          this.fetchRecords(state, unitType, deadline),
        ),
      ),
      this.municipalitiesClient.fetchNames(state),
    ]);
    const records = recordsByType.flat();

    const units = records
      .map((record) => normalizeUnit(record, municipalities))
      .filter((unit): unit is HealthUnit => unit !== null);

    return [...new Map(units.map((unit) => [unit.id, unit])).values()].sort(
      (left, right) => left.name.localeCompare(right.name, 'pt-BR'),
    );
  }

  private async fetchRecords(
    state: BrazilianState | null,
    unitType: number,
    deadline: AbortSignal,
  ): Promise<JsonRecord[]> {
    const records: JsonRecord[] = [];

    // CNES treats offset as a record index, so a batch of pages can be
    // requested concurrently; the first short page marks the end.
    for (let page = 0; page < MAX_PAGES; page += PAGE_BATCH_SIZE) {
      const batch = await Promise.all(
        Array.from({ length: PAGE_BATCH_SIZE }, (_, index) =>
          this.fetchPage(state, unitType, page + index, deadline),
        ),
      );

      for (const pageRecords of batch) {
        records.push(...pageRecords);
        if (pageRecords.length < PAGE_SIZE) return records;
      }
    }

    throw new Error('CNES pagination exceeded the safety limit');
  }

  private async fetchPage(
    state: BrazilianState | null,
    unitType: number,
    page: number,
    deadline: AbortSignal,
  ): Promise<JsonRecord[]> {
    const url = new URL(CNES_API_URL);
    url.search = new URLSearchParams({
      codigo_tipo_unidade: String(unitType),
      ...(state && { codigo_uf: state.ibgeCode }),
      status: '1',
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    }).toString();

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.any([
        deadline,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });

    if (!response.ok) {
      throw new Error(`CNES request failed with status ${response.status}`);
    }

    return parsePage(await response.json());
  }
}
