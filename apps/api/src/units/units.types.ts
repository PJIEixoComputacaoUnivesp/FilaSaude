export interface UnitAddress {
  street: string | null;
  number: string | null;
  district: string | null;
  postalCode: string | null;
  /** IBGE municipality code with 6 digits, as CNES identifies it. */
  municipalityCode: string;
  city: string;
  state: string;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Where the position comes from: `source` is the CNES coordinate as declared;
 * `history` is the latest earlier CNES coordinate that is inside the municipality
 * and was registered for the same address (see `referenceMonth`); `municipality`
 * is the center of the declared municipality. The last two are used when the
 * current CNES coordinate is missing or outside the municipality.
 */
export type LocationPrecision = 'source' | 'history' | 'municipality';

export interface UnitLocation {
  latitude: number | null;
  longitude: number | null;
  precision: LocationPrecision;
  /** The CNES coordinate replaced by `latitude`/`longitude`, kept for audit. */
  original: Coordinate | null;
  /** CNES monthly release (`YYYY-MM`) the `history` position comes from. */
  referenceMonth: string | null;
}

export interface HealthUnit {
  id: string;
  name: string;
  unitType:
    | 'PRONTO ATENDIMENTO'
    | 'PRONTO SOCORRO GERAL'
    | 'PRONTO SOCORRO ESPECIALIZADO';
  address: UnitAddress;
  location: UnitLocation;
  serviceHours: string | null;
  lastUpdatedAt: string;
}

export interface UnitsMetadata {
  count: number;
  state: string;
  dataOrigin: 'live' | 'fallback';
  isStale: boolean;
  retrievedAt: string;
  latestSourceUpdate: string;
  source: {
    name: string;
    url: string;
  };
}

export interface UnitsResponse {
  data: HealthUnit[];
  metadata: UnitsMetadata;
}
