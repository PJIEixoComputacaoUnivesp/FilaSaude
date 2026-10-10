import { NationalStateCode } from "./brazilianStates";

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
  unitType:
    | "PRONTO ATENDIMENTO"
    | "PRONTO SOCORRO GERAL"
    | "PRONTO SOCORRO ESPECIALIZADO";
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
    state: string;
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
    [
      "PRONTO ATENDIMENTO",
      "PRONTO SOCORRO GERAL",
      "PRONTO SOCORRO ESPECIALIZADO",
    ].includes(value.unitType as string) &&
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
    typeof value.metadata.state !== "string" ||
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

export async function fetchUnits(
  state: string,
  signal?: AbortSignal,
): Promise<UnitsResponse> {
  const response = await fetch(
    `/api/units?state=${encodeURIComponent(state)}`,
    {
      headers: { Accept: "application/json" },
      signal,
    },
  );

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

/** Lowercases and strips accents so "sao paulo" finds "São Paulo". */
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

export function filterUnits(units: HealthUnit[], query: string): HealthUnit[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return units;

  return units.filter((unit) =>
    normalizeSearchText(
      [unit.name, formatAddress(unit.address), unit.serviceHours]
        .filter(Boolean)
        .join(" "),
    ).includes(normalizedQuery),
  );
}

const collator = new Intl.Collator("pt-BR");

/** Alphabetical by UF, city and name: a neutral order, not a ranking. */
export function sortUnits(units: HealthUnit[]): HealthUnit[] {
  return [...units].sort(
    (a, b) =>
      collator.compare(a.address.state, b.address.state) ||
      collator.compare(a.address.city, b.address.city) ||
      collator.compare(a.name, b.name),
  );
}

export function hasLocation(unit: HealthUnit): boolean {
  return unit.location.latitude !== null && unit.location.longitude !== null;
}

export function formatSourceDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR").format(date);
}

/**
 * Says when the data shown is the local copy instead of a live query. The
 * national query is always answered from that copy by design, so it is not an
 * outage and must not read like one.
 */
export function dataOriginNotice(
  metadata: UnitsResponse["metadata"],
): { text: string; isOutage: boolean } | null {
  if (!metadata.isStale) return null;

  const date = formatSourceDate(metadata.latestSourceUpdate);
  const isNational =
    metadata.state === NationalStateCode.All ||
    metadata.state === NationalStateCode.Brazil;

  return isNational
    ? { text: `Cópia nacional do CNES, atualizada até ${date}.`, isOutage: false }
    : {
        text: `A fonte oficial está temporariamente indisponível. Exibimos a cópia de segurança atualizada até ${date}.`,
        isOutage: true,
      };
}
