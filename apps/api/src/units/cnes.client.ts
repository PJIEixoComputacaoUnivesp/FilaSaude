import { Injectable } from '@nestjs/common';
import { MunicipalitiesClient } from './municipalities.client.js';
import type { BrazilianState } from './states.js';
import type { HealthUnit } from './units.types.js';

const CNES_API_URL =
  'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const PAGE_SIZE = 20;
const MAX_PAGES = 100;
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
  state: BrazilianState,
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
      state: state.abbreviation,
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

  async fetchUnits(state: BrazilianState): Promise<HealthUnit[]> {
    const [recordsByType, municipalities] = await Promise.all([
      Promise.all(
        [...unitTypes.keys()].map((unitType) =>
          this.fetchRecords(state, unitType),
        ),
      ),
      this.municipalitiesClient.fetchNames(state),
    ]);
    const records = recordsByType.flat();

    const units = records
      .map((record) => normalizeUnit(record, municipalities, state))
      .filter((unit): unit is HealthUnit => unit !== null);

    return [...new Map(units.map((unit) => [unit.id, unit])).values()].sort(
      (left, right) => left.name.localeCompare(right.name, 'pt-BR'),
    );
  }

  private async fetchRecords(
    state: BrazilianState,
    unitType: number,
  ): Promise<JsonRecord[]> {
    const records: JsonRecord[] = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(CNES_API_URL);
      url.search = new URLSearchParams({
        codigo_tipo_unidade: String(unitType),
        codigo_uf: state.ibgeCode,
        status: '1',
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      }).toString();

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`CNES request failed with status ${response.status}`);
      }

      const pageRecords = parsePage(await response.json());
      records.push(...pageRecords);
      if (pageRecords.length < PAGE_SIZE) return records;
    }

    throw new Error('CNES pagination exceeded the safety limit');
  }
}
