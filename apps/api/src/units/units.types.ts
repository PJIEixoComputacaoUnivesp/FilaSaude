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
 * Where the position comes from: `source` is a coordinate from a public source
 * identified in `sources` (normally CNES, or GeoSampa after enrichment);
 * `history` is the latest earlier CNES coordinate that is inside the municipality
 * and was registered for the same address (see `referenceMonth`); `municipality`
 * is the center of the declared municipality. The last two are used when the
 * current CNES coordinate is missing or outside the municipality. `manual` is
 * a position an administrator set for the unit (see `correctedAt`); it takes
 * precedence over the others.
 */
export type LocationPrecision = 'source' | 'history' | 'municipality' | 'manual';

export interface UnitLocation {
  latitude: number | null;
  longitude: number | null;
  precision: LocationPrecision;
  /** The CNES coordinate replaced by `latitude`/`longitude`, kept for audit. */
  original: Coordinate | null;
  /** CNES monthly release (`YYYY-MM`) the `history` position comes from. */
  referenceMonth: string | null;
  /** Date (`YYYY-MM-DD`) an administrator set a `manual` position. */
  correctedAt: string | null;
}

export type UnitSourceField =
  'identity' | 'address' | 'location' | 'serviceHours';

export interface UnitSource {
  name: string;
  url: string;
  fields: UnitSourceField[];
  lastUpdatedAt: string | null;
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
  sources: UnitSource[];
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
