import { Injectable } from '@nestjs/common';
import type { HealthUnit, UnitSourceField } from './units.types.js';

const GEOSAMPA_WFS_URL =
  'https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs';
export const GEOSAMPA_SOURCE_URL =
  'https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/search?topicCat=health';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_NEARBY_DISTANCE_METERS = 100;
const MAX_EXACT_NAME_DISTANCE_METERS = 1_000;
const MIN_NAME_SIMILARITY = 0.5;

type JsonRecord = Record<string, unknown>;

interface GeoSampaUnit {
  name: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`GeoSampa returned an invalid ${key}`);
  }
  return value.trim();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePostalCode(value: string | null): string | null {
  const normalized = value?.replace(/\D/g, '') ?? '';
  return normalized.length === 8 ? normalized : null;
}

function nameSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeText(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(' ').filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersectionSize += 1;
  }
  return intersectionSize / union.size;
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (right.latitude - left.latitude) * radians;
  const longitudeDelta = (right.longitude - left.longitude) * radians;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(left.latitude * radians) *
      Math.cos(right.latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(value));
}

function parseUnits(payload: unknown): GeoSampaUnit[] {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    throw new Error('GeoSampa returned an unexpected response');
  }

  return payload.features.map((feature) => {
    if (
      !isRecord(feature) ||
      !isRecord(feature.properties) ||
      !isRecord(feature.geometry) ||
      feature.geometry.type !== 'Point' ||
      !Array.isArray(feature.geometry.coordinates)
    ) {
      throw new Error('GeoSampa returned an invalid feature');
    }

    const [longitude, latitude] = feature.geometry.coordinates;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new Error('GeoSampa returned invalid coordinates');
    }

    const postalCode = feature.properties.cd_cep_equipamento;
    return {
      name: requiredString(feature.properties, 'nm_equipamento'),
      postalCode:
        typeof postalCode === 'string' ? normalizePostalCode(postalCode) : null,
      latitude,
      longitude,
    };
  });
}

function isMatch(unit: HealthUnit, candidate: GeoSampaUnit): boolean {
  const similarity = nameSimilarity(unit.name, candidate.name);
  const sameName = normalizeText(unit.name) === normalizeText(candidate.name);
  const samePostalCode =
    normalizePostalCode(unit.address.postalCode) !== null &&
    normalizePostalCode(unit.address.postalCode) === candidate.postalCode;
  const reference = unit.location.original ?? unit.location;
  const distance =
    reference.latitude === null || reference.longitude === null
      ? Number.POSITIVE_INFINITY
      : distanceMeters(
          {
            latitude: reference.latitude,
            longitude: reference.longitude,
          },
          candidate,
        );

  return (
    (sameName &&
      (samePostalCode || distance <= MAX_EXACT_NAME_DISTANCE_METERS)) ||
    (similarity >= MIN_NAME_SIMILARITY &&
      (samePostalCode || distance <= MAX_NEARBY_DISTANCE_METERS))
  );
}

function matchingCandidates(
  unit: HealthUnit,
  candidates: readonly GeoSampaUnit[],
): GeoSampaUnit[] {
  return candidates.filter((candidate) => isMatch(unit, candidate));
}

@Injectable()
export class GeoSampaClient {
  async enrichLocations(units: readonly HealthUnit[]): Promise<HealthUnit[]> {
    const candidates = await this.fetchUnits();
    const matchesByUnit = units.map((unit) =>
      unit.address.city === 'São Paulo' && unit.location.precision !== 'manual'
        ? matchingCandidates(unit, candidates)
        : [],
    );
    const matchCounts = new Map<GeoSampaUnit, number>();
    for (const matches of matchesByUnit) {
      for (const match of matches) {
        matchCounts.set(match, (matchCounts.get(match) ?? 0) + 1);
      }
    }

    return units.map((unit, index) => {
      const matches = matchesByUnit[index];
      if (matches.length !== 1) return unit;

      const match = matches[0];
      if (matchCounts.get(match) !== 1) return unit;

      const cnesSource = unit.sources[0];
      const cnesFields = cnesSource.fields.filter(
        (field): field is UnitSourceField => field !== 'location',
      );

      return {
        ...unit,
        location: {
          latitude: match.latitude,
          longitude: match.longitude,
          precision: 'source',
          original: null,
          referenceMonth: null,
          correctedAt: null,
        },
        sources: [
          { ...cnesSource, fields: cnesFields },
          {
            name: 'GeoSampa — Urgência / Emergência',
            url: GEOSAMPA_SOURCE_URL,
            fields: ['location'],
            lastUpdatedAt: null,
          },
        ],
      };
    });
  }

  private async fetchUnits(): Promise<GeoSampaUnit[]> {
    const url = new URL(GEOSAMPA_WFS_URL);
    url.search = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'geoportal:equipamento_saude_urgencia_emergencia',
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
    }).toString();

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`GeoSampa request failed with status ${response.status}`);
    }
    return parseUnits(await response.json());
  }
}
