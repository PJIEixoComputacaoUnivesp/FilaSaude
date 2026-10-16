/**
 * Simulated occupancy (proposal 0001). The values are synthetic, produced by
 * the project's simulator, and every screen that shows them says so.
 */

export type OccupancyLevel = "low" | "moderate" | "high";
export type OccupancyCategoryCode =
  "observation" | "stabilization" | "inpatient";

export interface OccupancyCategory {
  code: OccupancyCategoryCode;
  capacity: number;
  occupied: number;
}

export interface UnitOccupancy {
  unitCnes: string;
  percentage: number | null;
  level: OccupancyLevel | null;
  confirmation: "recent" | "stale";
  categories: OccupancyCategory[];
  occurredAt: string;
  observedAt: string;
  receivedAt: string;
}

export interface OccupancyMetadata {
  simulated: true;
  source: { name: string; description: string };
  generatedAt: string;
  staleAfterMinutes: number;
}

export interface OccupancyResponse {
  data: UnitOccupancy[];
  metadata: OccupancyMetadata;
}

export interface OccupancyHistoryPoint {
  percentage: number | null;
  level: OccupancyLevel | null;
  categories: OccupancyCategory[];
  occurredAt: string;
  observedAt: string;
}

export interface OccupancyHistoryResponse {
  data: {
    unitCnes: string;
    current: UnitOccupancy | null;
    history: OccupancyHistoryPoint[];
  };
  metadata: OccupancyMetadata & { periodHours: number };
}

/**
 * What a unit shows on the layer. `unknown` is a recent snapshot without
 * capacity; `stale` is a snapshot older than the confirmation limit, whose
 * level is no longer shown.
 */
export type OccupancyStatus = OccupancyLevel | "unknown" | "stale";

export const OCCUPANCY_STATUSES: readonly OccupancyStatus[] = [
  "low",
  "moderate",
  "high",
  "unknown",
  "stale",
];

export const STATUS_LABELS: Record<OccupancyStatus, string> = {
  low: "Ocupação baixa",
  moderate: "Ocupação moderada",
  high: "Ocupação alta",
  unknown: "Ocupação não informada",
  stale: "Sem confirmação recente",
};

/** Short legend texts for the thresholds the API uses (60% and 85%). */
export const STATUS_RANGES: Partial<Record<OccupancyStatus, string>> = {
  low: "abaixo de 60%",
  moderate: "de 60% a 84%",
  high: "85% ou mais",
};

export const CATEGORY_LABELS: Record<OccupancyCategoryCode, string> = {
  observation: "Observação",
  stabilization: "Estabilização",
  inpatient: "Internação",
};

/**
 * One violet scale, light to dark, plus neutral gray. It never reuses the
 * colors of clinical risk classification (red, orange, yellow, green and
 * blue), so a level cannot read as a triage priority. Canvas markers do not
 * resolve CSS variables, so the values live here and in index.css.
 */
export const STATUS_COLORS: Record<
  OccupancyStatus,
  { fill: string; stroke: string; hollow: boolean }
> = {
  low: { fill: "#c4b5fd", stroke: "#4c1d95", hollow: false },
  moderate: { fill: "#8b5cf6", stroke: "#ffffff", hollow: false },
  high: { fill: "#4c1d95", stroke: "#ffffff", hollow: false },
  unknown: { fill: "#ffffff", stroke: "#475569", hollow: true },
  stale: { fill: "#ffffff", stroke: "#475569", hollow: true },
};

export function occupancyStatus(occupancy: UnitOccupancy): OccupancyStatus {
  if (occupancy.confirmation === "stale") return "stale";
  return occupancy.level ?? "unknown";
}

/** Visible and spoken summary, e.g. "Ocupação alta (90%)". */
export function describeOccupancy(occupancy: UnitOccupancy): string {
  const status = occupancyStatus(occupancy);
  if (status === "stale" || status === "unknown") return STATUS_LABELS[status];
  return `${STATUS_LABELS[status]} (${occupancy.percentage}%)`;
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Brasília time, which the demonstration and the team use. */
export function formatTime(value: string): string {
  return timeFormat.format(new Date(value));
}

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value)).replace(", ", " às ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CATEGORY_CODES = Object.keys(CATEGORY_LABELS);

function isCategory(value: unknown): value is OccupancyCategory {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    CATEGORY_CODES.includes(value.code) &&
    Number.isInteger(value.capacity) &&
    Number.isInteger(value.occupied)
  );
}

function isLevel(value: unknown): value is OccupancyLevel | null {
  return (
    value === null ||
    value === "low" ||
    value === "moderate" ||
    value === "high"
  );
}

function isSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.percentage === null || typeof value.percentage === "number") &&
    isLevel(value.level) &&
    Array.isArray(value.categories) &&
    value.categories.every(isCategory) &&
    typeof value.occurredAt === "string" &&
    typeof value.observedAt === "string"
  );
}

function isUnitOccupancy(value: unknown): value is UnitOccupancy {
  return (
    isSnapshot(value) &&
    isRecord(value) &&
    typeof value.unitCnes === "string" &&
    (value.confirmation === "recent" || value.confirmation === "stale")
  );
}

/** Operational data without the simulation mark is never shown. */
function isMetadata(value: unknown): value is OccupancyMetadata {
  return (
    isRecord(value) &&
    value.simulated === true &&
    isRecord(value.source) &&
    typeof value.source.name === "string" &&
    typeof value.source.description === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.staleAfterMinutes === "number"
  );
}

export function parseOccupancyResponse(value: unknown): OccupancyResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(isUnitOccupancy) ||
    !isMetadata(value.metadata)
  ) {
    throw new Error("Resposta de ocupação inválida");
  }
  return value as unknown as OccupancyResponse;
}

export function parseOccupancyHistory(
  value: unknown,
): OccupancyHistoryResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    typeof value.data.unitCnes !== "string" ||
    !(value.data.current === null || isUnitOccupancy(value.data.current)) ||
    !Array.isArray(value.data.history) ||
    !value.data.history.every(isSnapshot) ||
    !isMetadata(value.metadata) ||
    !isRecord(value.metadata) ||
    typeof value.metadata.periodHours !== "number"
  ) {
    throw new Error("Histórico de ocupação inválido");
  }
  return value as unknown as OccupancyHistoryResponse;
}

/** `null` means the demonstration is turned off on this server (404). */
export async function fetchOccupancy(
  signal?: AbortSignal,
): Promise<OccupancyResponse | null> {
  const response = await fetch("/api/occupancy", { signal });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error("Não foi possível consultar a ocupação simulada.");
  return parseOccupancyResponse(await response.json());
}

export async function fetchOccupancyHistory(
  unitCnes: string,
  signal?: AbortSignal,
): Promise<OccupancyHistoryResponse | null> {
  const response = await fetch(
    `/api/units/${encodeURIComponent(unitCnes)}/occupancy-history`,
    { signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      "Não foi possível consultar o histórico da ocupação simulada.",
    );
  }
  return parseOccupancyHistory(await response.json());
}
