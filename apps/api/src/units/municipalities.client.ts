import { Injectable } from '@nestjs/common';
import type { BrazilianState } from './states.js';

const IBGE_API_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class MunicipalitiesClient {
  async fetchNames(state: BrazilianState): Promise<Map<string, string>> {
    const response = await fetch(
      `${IBGE_API_URL}/estados/${state.abbreviation}/municipios`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw new Error(`IBGE request failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !payload.every(isRecord)) {
      throw new Error('IBGE returned an unexpected response');
    }

    const municipalities = new Map<string, string>();
    for (const municipality of payload) {
      if (
        typeof municipality.id !== 'number' ||
        typeof municipality.nome !== 'string'
      ) {
        throw new Error('IBGE returned an invalid municipality');
      }

      municipalities.set(
        String(municipality.id).slice(0, 6),
        municipality.nome,
      );
    }

    return municipalities;
  }
}
