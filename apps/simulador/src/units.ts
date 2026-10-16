export interface SimulatorUnit {
  id: string;
  name: string;
  municipalityCode: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}

interface UnitsApiResponse {
  data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toUnit(value: unknown): SimulatorUnit | null {
  if (!isRecord(value) || !isRecord(value.address) || !isRecord(value.location)) return null;
  const { address, location } = value;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof address.municipalityCode !== 'string' ||
    typeof address.city !== 'string' ||
    typeof address.state !== 'string'
  ) {
    return null;
  }

  const latitude = location.latitude;
  const longitude = location.longitude;
  if (
    latitude !== null && typeof latitude !== 'number' ||
    longitude !== null && typeof longitude !== 'number'
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    municipalityCode: address.municipalityCode,
    city: address.city,
    state: address.state,
    latitude,
    longitude,
  };
}

export async function fetchUnits(apiUrl: string, state: string | null): Promise<SimulatorUnit[]> {
  const url = new URL('/units', apiUrl);
  if (state) url.searchParams.set('state', state);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`A API não retornou o catálogo de unidades (${response.status}).`);
  }

  const body = (await response.json()) as UnitsApiResponse;
  if (!Array.isArray(body.data)) throw new Error('A API retornou um catálogo inválido.');

  const units = body.data.map(toUnit).filter((unit): unit is SimulatorUnit => unit !== null);
  if (units.length !== body.data.length) {
    throw new Error('A API retornou unidades sem os campos necessários para o simulador.');
  }
  return units;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function distanceKm(
  latitude: number,
  longitude: number,
  referenceLatitude: number,
  referenceLongitude: number,
): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(referenceLatitude - latitude);
  const longitudeDelta = toRadians(referenceLongitude - longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude)) *
      Math.cos(toRadians(referenceLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface UnitSelectionOptions {
  unitCnes: readonly string[];
  municipalityCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  maxUnits: number;
}

export function selectUnits(
  units: readonly SimulatorUnit[],
  options: UnitSelectionOptions,
): SimulatorUnit[] {
  if (
    options.unitCnes.length === 0 &&
    !options.municipalityCode &&
    !options.city &&
    options.latitude === null
  ) {
    throw new Error(
      'Informe CNES, município, cidade ou coordenadas para selecionar unidades.',
    );
  }

  if (options.unitCnes.length > 0) {
    const requested = new Set(options.unitCnes);
    const selected = units.filter((unit) => requested.has(unit.id)).sort(byId);
    const missing = options.unitCnes.filter((id) => !selected.some((unit) => unit.id === id));
    if (missing.length > 0) throw new Error(`CNES não encontrado no catálogo: ${missing.join(', ')}.`);
    return selected.slice(0, options.maxUnits);
  }

  let candidates = [...units];
  if (options.municipalityCode) {
    candidates = candidates.filter((unit) => unit.municipalityCode === options.municipalityCode);
  } else if (options.city) {
    const city = normalize(options.city);
    candidates = candidates.filter((unit) => normalize(unit.city) === city);
  }

  const hasReference = options.latitude !== null && options.longitude !== null;
  if (hasReference) {
    candidates = candidates
      .map((unit) => ({
        unit,
        distance: unit.latitude === null || unit.longitude === null
          ? Number.POSITIVE_INFINITY
          : distanceKm(unit.latitude, unit.longitude, options.latitude!, options.longitude!),
      }))
      .filter(({ distance }) => distance <= options.radiusKm)
      .sort((left, right) => left.distance - right.distance || left.unit.id.localeCompare(right.unit.id))
      .map(({ unit }) => unit);
  } else {
    candidates.sort(byId);
  }

  if (candidates.length === 0) throw new Error('Nenhuma unidade corresponde aos critérios de seleção.');
  return candidates.slice(0, options.maxUnits);
}

function byId(left: SimulatorUnit, right: SimulatorUnit): number {
  return left.id.localeCompare(right.id);
}
