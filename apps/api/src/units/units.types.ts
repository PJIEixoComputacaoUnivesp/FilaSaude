export interface UnitAddress {
  street: string | null;
  number: string | null;
  district: string | null;
  postalCode: string | null;
  city: string;
  state: string;
}

export interface UnitLocation {
  latitude: number | null;
  longitude: number | null;
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
