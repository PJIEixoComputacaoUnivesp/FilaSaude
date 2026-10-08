import { Injectable } from '@nestjs/common';

const CNES_HISTORY_URL =
  'https://apidadosabertos.saude.gov.br/assistencia-a-saude/cnes-estabelecimentos';
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const REQUEST_TIMEOUT_MS = 10_000;
// The service lets a fetch outlive the deadline of whoever started it, so the
// fetch needs a bound of its own.
const TOTAL_TIMEOUT_MS = 20_000;

/** One monthly CNES release of an establishment. */
export interface CnesHistoryEntry {
  /** `YYYY-MM` of the monthly release. */
  referenceMonth: string;
  latitude: number | null;
  longitude: number | null;
  street: string | null;
  number: string | null;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalCoordinate(
  record: JsonRecord,
  key: string,
  limit: number,
): number | null {
  const value = record[key];
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
    ? value
    : null;
}

/** Turns the `nu_comp` release number (e.g. 202511) into `2025-11`. */
function referenceMonth(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  const year = Math.floor(value / 100);
  const month = value % 100;
  if (year < 1990 || year > 2200 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseEntry(record: JsonRecord): CnesHistoryEntry | null {
  const month = referenceMonth(record.nu_comp);
  if (!month) return null;
  return {
    referenceMonth: month,
    latitude: optionalCoordinate(record, 'nu_latitude', 90),
    longitude: optionalCoordinate(record, 'nu_longitude', 180),
    street: optionalString(record, 'no_logradouro'),
    number: optionalString(record, 'nu_endereco'),
  };
}

@Injectable()
export class CnesHistoryClient {
  /**
   * Fetches the monthly CNES releases of one establishment. `unitId` is the
   * 7-digit CNES code: the API matches it as text, so "0113360" finds the unit
   * and "113360" finds nothing.
   */
  async fetch(
    unitId: string,
    signal?: AbortSignal,
  ): Promise<CnesHistoryEntry[]> {
    const entries: CnesHistoryEntry[] = [];
    const total = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
    const bound = signal ? AbortSignal.any([signal, total]) : total;

    // As in the establishments endpoint, offset is a record index and not
    // the page number described in the Swagger.
    for (let page = 0; page < MAX_PAGES; page++) {
      const records = await this.fetchPage(unitId, page * PAGE_SIZE, bound);
      for (const record of records) {
        // The API silently ignores filters it does not know, so a response
        // may hold other establishments; keep only the one requested.
        if (Number(record.co_cnes) !== Number(unitId)) continue;
        const entry = parseEntry(record);
        if (entry) entries.push(entry);
      }
      if (records.length < PAGE_SIZE) return entries;
    }

    throw new Error('CNES history pagination exceeded the safety limit');
  }

  private async fetchPage(
    unitId: string,
    offset: number,
    signal?: AbortSignal,
  ): Promise<JsonRecord[]> {
    const url = new URL(CNES_HISTORY_URL);
    url.search = new URLSearchParams({
      co_cnes: unitId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    }).toString();

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      throw new Error(
        `CNES history request failed with status ${response.status}`,
      );
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.cnes_estabelecimentos)) {
      throw new Error('CNES history returned an unexpected response');
    }
    if (!payload.cnes_estabelecimentos.every(isRecord)) {
      throw new Error('CNES history returned an invalid establishment');
    }
    return payload.cnes_estabelecimentos;
  }
}
