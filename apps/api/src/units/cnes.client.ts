import { Injectable } from '@nestjs/common';
import type { HealthUnit } from './units.types.js';

const CNES_API_URL =
  'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const PAGE_SIZE = 20;
const MAX_PAGES = 20;

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

function requiredString(record: JsonRecord, key: string): string {
  const value = optionalString(record, key);
  if (!value) {
    throw new Error(`CNES returned an invalid ${key}`);
  }
  return value;
}

function cnesId(record: JsonRecord): string {
  const value = record.codigo_cnes;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('CNES returned an invalid codigo_cnes');
  }
  return String(value).padStart(7, '0');
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

function normalizeUnit(record: JsonRecord): HealthUnit | null {
  if (record.estabelecimento_faz_atendimento_ambulatorial_sus !== 'SIM') {
    return null;
  }

  return {
    id: cnesId(record),
    name: requiredString(record, 'nome_fantasia'),
    unitType: 'PRONTO ATENDIMENTO',
    address: {
      street: optionalString(record, 'endereco_estabelecimento'),
      number: optionalString(record, 'numero_estabelecimento'),
      district: optionalString(record, 'bairro_estabelecimento'),
      postalCode: optionalString(record, 'codigo_cep_estabelecimento'),
      city: 'São Paulo',
      state: 'SP',
    },
    location: {
      latitude: optionalNumber(record, 'latitude_estabelecimento_decimo_grau'),
      longitude: optionalNumber(
        record,
        'longitude_estabelecimento_decimo_grau',
      ),
    },
    serviceHours: optionalString(record, 'descricao_turno_atendimento'),
    lastUpdatedAt: requiredString(record, 'data_atualizacao'),
  };
}

@Injectable()
export class CnesClient {
  async fetchUnits(): Promise<HealthUnit[]> {
    const records: JsonRecord[] = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_SIZE;
      const url = new URL(CNES_API_URL);
      url.search = new URLSearchParams({
        codigo_tipo_unidade: '73',
        codigo_uf: '35',
        codigo_municipio: '355030',
        status: '1',
        limit: String(PAGE_SIZE),
        offset: String(offset),
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

      if (pageRecords.length < PAGE_SIZE) {
        break;
      }

      if (page === MAX_PAGES - 1) {
        throw new Error('CNES pagination exceeded the safety limit');
      }
    }

    const units = records
      .map(normalizeUnit)
      .filter((unit): unit is HealthUnit => unit !== null);

    return [...new Map(units.map((unit) => [unit.id, unit])).values()].sort(
      (left, right) => left.name.localeCompare(right.name, 'pt-BR'),
    );
  }
}
