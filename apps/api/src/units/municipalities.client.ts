import { Injectable, Logger } from '@nestjs/common';
import snapshot from './units.snapshot.json' with { type: 'json' };
import type { BrazilianState } from './states.js';

const IBGE_API_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class MunicipalitiesClient {
  private readonly logger = new Logger(MunicipalitiesClient.name);

  /** Fetches municipality names of one state, or of the whole country when state is null. */
  async fetchNames(state: BrazilianState | null): Promise<Map<string, string>> {
    try {
      return await this.fetchRemote(state);
    } catch (error: unknown) {
      const fallback = this.fallbackNames(state);
      if (fallback.size === 0) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `IBGE municipalities unavailable; using embedded names for ${state?.abbreviation ?? 'Brazil'}: ${reason}`,
      );
      return fallback;
    }
  }

  private async fetchRemote(
    state: BrazilianState | null,
  ): Promise<Map<string, string>> {
    const path = state
      ? `/estados/${state.abbreviation}/municipios`
      : '/municipios';
    const response = await fetch(`${IBGE_API_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

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

  private fallbackNames(state: BrazilianState | null): Map<string, string> {
    return new Map(
      snapshot
        .filter((unit) => !state || unit.address.state === state.abbreviation)
        .map((unit) => [unit.address.municipalityCode, unit.address.city]),
    );
  }
}
