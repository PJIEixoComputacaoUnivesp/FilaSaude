import { Injectable } from '@nestjs/common';
import type { WebhookSourceConfiguration } from './occupancy-snapshot.types.js';

const SOURCE_CONFIG_ENV = 'WEBHOOK_SOURCE_CONFIG';
const SOURCE_SECRET_MIN_LENGTH = 32;

@Injectable()
export class WebhookSourceConfigService {
  private readonly sources: ReadonlyMap<string, WebhookSourceConfiguration>;

  constructor() {
    this.sources = this.loadSources(process.env[SOURCE_CONFIG_ENV]);
  }

  find(sourceId: string): WebhookSourceConfiguration | undefined {
    return this.sources.get(sourceId);
  }

  private loadSources(
    rawConfig: string | undefined,
  ): ReadonlyMap<string, WebhookSourceConfiguration> {
    if (!rawConfig) return new Map();

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawConfig);
    } catch {
      throw new Error(`${SOURCE_CONFIG_ENV} must be valid JSON`);
    }

    if (!isRecord(parsed)) {
      throw new Error(`${SOURCE_CONFIG_ENV} must be a JSON object`);
    }

    const sources = new Map<string, WebhookSourceConfiguration>();
    for (const [sourceId, value] of Object.entries(parsed)) {
      if (
        !isRecord(value) ||
        typeof value.secret !== 'string' ||
        value.secret.length < SOURCE_SECRET_MIN_LENGTH
      ) {
        throw new Error(
          `${SOURCE_CONFIG_ENV}.${sourceId}.secret must contain at least ${SOURCE_SECRET_MIN_LENGTH} characters`,
        );
      }
      if (
        !Array.isArray(value.unitCnes) ||
        !value.unitCnes.every(
          (unitCnes): unitCnes is string =>
            typeof unitCnes === 'string' && /^\d{7}$/.test(unitCnes),
        )
      ) {
        throw new Error(
          `${SOURCE_CONFIG_ENV}.${sourceId}.unitCnes must contain CNES codes`,
        );
      }
      sources.set(sourceId, {
        secret: value.secret,
        unitCnes: [...value.unitCnes],
      });
    }
    return sources;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
