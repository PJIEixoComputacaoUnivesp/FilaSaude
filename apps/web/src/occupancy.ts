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

/** Indicators that can set the level of a unit. */
export type OccupancyIndicator = "beds" | "waiting";

/** Absent fields are "not informed", never zero. */
export interface UnitAttendance {
  waiting?: number;
  inService?: number;
  serviceSlots?: number;
  completed?: { count: number; periodStart: string; periodEnd: string };
}

export interface UnitOccupancy {
  unitCnes: string;
  /** Present in current API responses; optional for older snapshots. */
  eventId?: string;
  /** Bed occupancy, sum of occupied over sum of capacity. */
  percentage: number | null;
  /** API aggregate of beds and waiting; presentation uses attendance instead. */
  level: OccupancyLevel | null;
  confirmation: "recent" | "stale";
  /** Optional: an API without the attendance flow does not send them. */
  indicators?: Partial<Record<OccupancyIndicator, OccupancyLevel | null>>;
  levelDrivers?: OccupancyIndicator[];
  attendance?: UnitAttendance | null;
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
  levelDrivers?: OccupancyIndicator[];
  attendance?: UnitAttendance | null;
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
 * a waiting count or active service slots; `stale` is a snapshot older than
 * the confirmation limit, whose level is no longer shown.
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
  low: "Espera baixa",
  moderate: "Espera moderada",
  high: "Espera alta",
  unknown: "Espera não informada",
  stale: "Sem confirmação recente",
};

/** Demonstration thresholds in people waiting per active service slot. */
export const STATUS_RANGES: Partial<Record<OccupancyStatus, string>> = {
  low: "menos de 1 pessoa esperando por posto",
  moderate: "de 1 a menos de 3 pessoas esperando por posto",
  high: "3 ou mais pessoas esperando por posto",
};

export const CATEGORY_LABELS: Record<OccupancyCategoryCode, string> = {
  observation: "Observação",
  stabilization: "Estabilização",
  inpatient: "Internação",
};

/**
 * Green, yellow and red, as a traffic light, with the same dark ring (12:1 or
 * more on any map tile), plus gray. The red is dark, so it also differs from
 * the green in lightness (about 2.7:1) for people who do not tell red from
 * green apart. These are also the colors of clinical
 * risk classification, so the level is never shown by color alone: the popup,
 * the list and the legend describe the simulated queue and the legend says
 * it is not a risk classification (ADR 0007).
 * "Not informed" is a solid gray disc, so it does not look like the hollow
 * ring of an approximate position; "stale" is a dashed hollow ring. Canvas
 * markers do not resolve CSS variables, so the values live here and in
 * index.css.
 */
export const STATUS_COLORS: Record<
  OccupancyStatus,
  { fill: string; stroke: string; hollow: boolean }
> = {
  low: { fill: "#16a34a", stroke: "#0f172a", hollow: false },
  moderate: { fill: "#facc15", stroke: "#0f172a", hollow: false },
  high: { fill: "#991b1b", stroke: "#0f172a", hollow: false },
  unknown: { fill: "#94a3b8", stroke: "#334155", hollow: false },
  stale: { fill: "#ffffff", stroke: "#475569", hollow: true },
};

/** Units outside the simulation keep the neutral brand marker. */
export const NEUTRAL_MARKER = { fill: "#1266cc", stroke: "#ffffff" };

/** One name for the synthetic data in every screen. */
export const SIMULATION_NOTICE =
  "Dados fictícios de leitos, pessoas em espera e atendimentos. Não representam a situação real da unidade, não estimam tempo de espera e não indicam qual unidade procurar.";

/** How the color is chosen; completed attendances never take part. */
export const OCCUPANCY_EXPLANATION =
  "A cor indica apenas a espera simulada: pessoas esperando por posto de atendimento ativo. Sem esses dados, a espera aparece como não informada. Leitos ficam nos detalhes da unidade e não mudam a cor, assim como pessoas em atendimento e atendimentos concluídos. Não é classificação de risco.";

/** Legend note: the colors are the same as those of clinical triage. */
export const COLOR_NOTICE =
  "Verde, amarelo e vermelho indicam só a situação simulada da unidade, não a gravidade de uma pessoa nem a ordem de atendimento.";

export function occupancyStatus(occupancy: UnitOccupancy): OccupancyStatus {
  if (occupancy.confirmation === "stale") return "stale";
  return waitingStatus(occupancy.attendance);
}

/** Map, list and history use the queue only, independently of the API aggregate. */
export function waitingStatus(
  attendance: UnitAttendance | null | undefined,
): OccupancyStatus {
  const ratio = waitingPerSlot(attendance);
  if (ratio === null) return "unknown";
  if (ratio >= 3) return "high";
  if (ratio >= 1) return "moderate";
  return "low";
}

/** People waiting per active slot, or `null` without both values. */
export function waitingPerSlot(
  attendance: UnitAttendance | null | undefined,
): number | null {
  if (attendance?.waiting === undefined || !attendance.serviceSlots)
    return null;
  return attendance.waiting / attendance.serviceSlots;
}

const decimalFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

/** Do not display a rounded ratio as belonging to the next waiting band. */
export function formatWaitingPerSlot(value: number): string {
  const formatted = formatDecimal(value);
  if (value < 1 && formatted === "1") return "menos de 1";
  if (value < 3 && formatted === "3") return "menos de 3";
  return formatted;
}

/** Visible and spoken queue summary, consistent with the marker color. */
export function describeOccupancy(occupancy: UnitOccupancy): string {
  const status = occupancyStatus(occupancy);
  if (status === "stale" || status === "unknown") return STATUS_LABELS[status];
  return `${STATUS_LABELS[status]}, ${formatWaitingPerSlot(waitingPerSlot(occupancy.attendance)!)} por posto`;
}

/** Explicit period of the completed attendances, in Brasília time. */
export function describeCompletedPeriod(
  completed: NonNullable<UnitAttendance["completed"]>,
): string {
  return `de ${formatDateTime(completed.periodStart)} a ${formatDateTime(completed.periodEnd)} (horário de Brasília, fim não incluído)`;
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

function isCount(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 0);
}

function isDateTime(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isAttendance(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;
  const { completed } = value;
  return (
    isCount(value.waiting) &&
    isCount(value.inService) &&
    isCount(value.serviceSlots) &&
    (completed === undefined ||
      (isRecord(completed) &&
        isCount(completed.count) &&
        completed.count !== undefined &&
        isDateTime(completed.periodStart) &&
        isDateTime(completed.periodEnd)))
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
    isAttendance(value.attendance) &&
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
    throw new Error(
      "Não foi possível consultar a ocupação simulada de leitos.",
    );
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
      "Não foi possível consultar o histórico da ocupação simulada de leitos.",
    );
  }
  return parseOccupancyHistory(await response.json());
}
