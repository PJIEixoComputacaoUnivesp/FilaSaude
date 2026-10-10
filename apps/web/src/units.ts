import { NationalStateCode } from "./brazilianStates";

export interface UnitAddress {
  street: string | null;
  number: string | null;
  district: string | null;
  postalCode: string | null;
  city: string;
  state: string;
}

export type UnitSourceField =
  "identity" | "address" | "location" | "serviceHours";

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
    | "PRONTO ATENDIMENTO"
    | "PRONTO SOCORRO GERAL"
    | "PRONTO SOCORRO ESPECIALIZADO";
  address: UnitAddress;
  location: {
    latitude: number | null;
    longitude: number | null;
    /**
     * `history`: the current CNES coordinate was unusable, so the point is the
     * latest earlier CNES coordinate for the same address (see `referenceMonth`).
     * `municipality`: no usable point exists, so it is the municipality center.
     * `manual`: an administrator set the position (see `correctedAt`).
     */
    precision: "source" | "history" | "municipality" | "manual";
    /** The coordinate CNES declared, when the position shown replaced it. */
    original?: { latitude: number; longitude: number } | null;
    /** CNES monthly release (`YYYY-MM`) a `history` point comes from. */
    referenceMonth: string | null;
    /** Date (`YYYY-MM-DD`) an administrator set a `manual` position. */
    correctedAt: string | null;
  };
  serviceHours: string | null;
  lastUpdatedAt: string;
  sources: UnitSource[];
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
    // An API that predates the position check sends no precision at all.
    (value.location.precision === undefined ||
      value.location.precision === "source" ||
      value.location.precision === "municipality" ||
      (value.location.precision === "history" &&
        typeof value.location.referenceMonth === "string") ||
      (value.location.precision === "manual" &&
        typeof value.location.correctedAt === "string")) &&
    typeof value.address.city === "string" &&
    typeof value.address.state === "string" &&
    typeof value.lastUpdatedAt === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isSource)
  );
}

function isSource(value: unknown): value is UnitSource {
  const validFields: UnitSourceField[] = [
    "identity",
    "address",
    "location",
    "serviceHours",
  ];
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    Array.isArray(value.fields) &&
    value.fields.every(
      (field) =>
        typeof field === "string" &&
        validFields.includes(field as UnitSourceField),
    ) &&
    (value.lastUpdatedAt === null || typeof value.lastUpdatedAt === "string")
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

  const response = value as unknown as UnitsResponse;
  // Those older responses only carry the coordinates as CNES declared them. An
  // unknown value is still rejected above, so a future kind of position is
  // never shown as if it were the CNES coordinate.
  for (const unit of response.data) unit.location.precision ??= "source";
  return response;
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

const searchTextCache = new WeakMap<HealthUnit, string>();

/** Name, address and hours, normalized once per unit and reused for each query. */
function searchableText(unit: HealthUnit): string {
  let text = searchTextCache.get(unit);
  if (text === undefined) {
    text = normalizeSearchText(
      [unit.name, formatAddress(unit.address), unit.serviceHours]
        .filter(Boolean)
        .join(" "),
    );
    searchTextCache.set(unit, text);
  }
  return text;
}

export function filterUnits(units: HealthUnit[], query: string): HealthUnit[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return units;

  return units.filter((unit) => searchableText(unit).includes(normalizedQuery));
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

/** Formats a `YYYY-MM` monthly release as `MM/AAAA`. */
export function formatReferenceMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[1]}` : value;
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

/** Says where the position on the map comes from. */
export function formatPosition({ location }: HealthUnit): string {
  if (location.latitude === null || location.longitude === null) {
    return "Coordenadas não informadas na fonte pública";
  }
  if (location.precision === "municipality") {
    return "Aproximada: centro do município (contorno do IBGE)";
  }
  if (location.precision === "manual" && location.correctedAt) {
    return `Posição corrigida manualmente em ${formatSourceDate(location.correctedAt)}`;
  }
  if (location.precision === "history" && location.referenceMonth) {
    return `Posição do CNES de ${formatReferenceMonth(location.referenceMonth)} (a coordenada atual não é utilizável)`;
  }
  return "Disponível";
}
