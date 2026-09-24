export interface UnitAddress {
  street: string | null;
  number: string | null;
  district: string | null;
  postalCode: string | null;
  city: string;
  state: string;
}

export interface HealthUnit {
  id: string;
  name: string;
  unitType: "PRONTO ATENDIMENTO";
  address: UnitAddress;
  location: {
    latitude: number | null;
    longitude: number | null;
  };
  serviceHours: string | null;
  lastUpdatedAt: string;
}

export interface UnitsResponse {
  data: HealthUnit[];
  metadata: {
    count: number;
    dataOrigin: "live" | "fallback";
    isStale: boolean;
    retrievedAt: string;
    latestSourceUpdate: string;
    source: {
      name: string;
      url: string;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnit(value: unknown): value is HealthUnit {
  if (
    !isRecord(value) ||
    !isRecord(value.address) ||
    !isRecord(value.location)
  ) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    value.unitType === "PRONTO ATENDIMENTO" &&
    typeof value.address.city === "string" &&
    typeof value.address.state === "string" &&
    typeof value.lastUpdatedAt === "string"
  );
}

function parseUnitsResponse(value: unknown): UnitsResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(isUnit) ||
    !isRecord(value.metadata) ||
    !isRecord(value.metadata.source) ||
    typeof value.metadata.count !== "number" ||
    (value.metadata.dataOrigin !== "live" &&
      value.metadata.dataOrigin !== "fallback") ||
    typeof value.metadata.isStale !== "boolean" ||
    typeof value.metadata.retrievedAt !== "string" ||
    typeof value.metadata.latestSourceUpdate !== "string" ||
    typeof value.metadata.source.name !== "string" ||
    typeof value.metadata.source.url !== "string"
  ) {
    throw new Error("A API retornou dados em um formato inesperado.");
  }

  return value as unknown as UnitsResponse;
}

export async function fetchUnits(signal?: AbortSignal): Promise<UnitsResponse> {
  const response = await fetch("/api/units", {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error("Não foi possível consultar as unidades agora.");
  }

  return parseUnitsResponse(await response.json());
}

export function formatAddress(address: UnitAddress): string {
  const street = [address.street, address.number].filter(Boolean).join(", ");
  return [street, address.district, `${address.city} - ${address.state}`]
    .filter(Boolean)
    .join(" · ");
}

export function formatSourceDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR").format(date);
}
