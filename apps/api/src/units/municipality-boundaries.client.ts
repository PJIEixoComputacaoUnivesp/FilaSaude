import { Injectable } from '@nestjs/common';
import type { Polygon, Position } from './geometry.js';

const IBGE_MESHES_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/estados';
const REQUEST_TIMEOUT_MS = 15_000;

/** Municipality boundaries by 6-digit IBGE code, as CNES identifies them. */
export type MunicipalityBoundaries = Map<string, Polygon[]>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

function isPolygon(value: unknown): value is Polygon {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (ring) =>
        Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition),
    )
  );
}

function parseGeometry(geometry: unknown): Polygon[] {
  if (!isRecord(geometry)) throw new Error('IBGE returned an invalid boundary');
  const { type, coordinates } = geometry;
  if (type === 'Polygon' && isPolygon(coordinates)) return [coordinates];
  if (
    type === 'MultiPolygon' &&
    Array.isArray(coordinates) &&
    coordinates.length > 0 &&
    coordinates.every(isPolygon)
  ) {
    return coordinates;
  }
  throw new Error('IBGE returned an invalid boundary');
}

@Injectable()
export class MunicipalityBoundariesClient {
  /** Fetches the simplified boundaries of every municipality of one state. */
  async fetch(stateAbbreviation: string): Promise<MunicipalityBoundaries> {
    const url = new URL(`${IBGE_MESHES_URL}/${stateAbbreviation}`);
    url.search = new URLSearchParams({
      intrarregiao: 'municipio',
      formato: 'application/vnd.geo+json',
      qualidade: 'minima',
    }).toString();

    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.geo+json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `IBGE boundaries request failed with status ${response.status}`,
      );
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.features)) {
      throw new Error('IBGE returned an unexpected boundaries response');
    }

    const boundaries: MunicipalityBoundaries = new Map();
    for (const feature of payload.features as unknown[]) {
      if (
        !isRecord(feature) ||
        !isRecord(feature.properties) ||
        typeof feature.properties.codarea !== 'string'
      ) {
        throw new Error('IBGE returned an invalid boundary');
      }
      boundaries.set(
        feature.properties.codarea.slice(0, 6),
        parseGeometry(feature.geometry),
      );
    }
    return boundaries;
  }
}
