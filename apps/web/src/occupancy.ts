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
  installedServiceSlots?: number;
  services?: SimulatedServiceCode[];
  completed?: { count: number; periodStart: string; periodEnd: string };
}

export const SERVICE_LABELS = {
  "general-care": "Atendimento geral",
  nursing: "Enfermagem",
  observation: "Observação",
  stabilization: "Estabilização",
} as const;
export type SimulatedServiceCode = keyof typeof SERVICE_LABELS;

export type WaitEstimate =
  | {
      status: "available";
      minutes: number;
      method: "recent-start-rate";
      sampleCount: number;
      started: number;
      windowStart: string;
      windowEnd: string;
    }
  | {
      status: "unavailable";
      reason:
        "missing-data" | "stale" | "insufficient-history" | "no-throughput";
    };

export type WaitComparison =
  | {
      status: "above-usual" | "usual";
      typicalMinutes: number;
      upperMinutes: number;
      sampleCount: number;
      windowStart: string;
      windowEnd: string;
    }
  | { status: "unavailable" };

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
  /** Optional for compatibility with APIs that predate the estimate. */
  waitEstimate?: WaitEstimate;
  /** Absent in older API responses: not compared. */
  waitComparison?: WaitComparison;
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
  stale: "Sem dados recentes",
};

/**
 * Demonstration thresholds in people waiting per active service slot, told as
 * the queue against the unit's simultaneous attendances ("posto" stays an
 * internal name: on screen it reads as "posto de saúde").
 */
export const STATUS_RANGES: Partial<Record<OccupancyStatus, string>> = {
  low: "fila menor que a capacidade de atendimento",
  moderate: "fila de 1 a menos de 3 vezes a capacidade",
  high: "fila de 3 vezes a capacidade ou mais",
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

/** Ring of the neutral swatch on white, where the marker's white ring vanishes. */
export const NEUTRAL_SWATCH_STROKE = "#0b3f80";

/** Where the full explanation of the simulation lives. */
export const ABOUT_SIMULATION = "/about#ocupacao-simulada";

/** Source line of every simulated container (popup, card, detail). */
export const SIMULATION_SOURCE = "Simulador do FilaSaúde";

/** Short notice, the same wherever the layer or its data shows. */
export const SIMULATION_NOTICE =
  "Dados simulados: não mostram a situação real das unidades.";

/** The same notice where only a few words fit (narrow map panel). */
export const SIMULATION_NOTICE_SHORT = "Dados simulados, não reais.";

export function describeWaitEstimate(occupancy: UnitOccupancy): string {
  if (occupancy.confirmation === "stale")
    return "Indisponível: dados desatualizados";
  const estimate = occupancy.waitEstimate;
  if (!estimate) return "Não informada";
  if (estimate.status === "available")
    return `${estimate.minutes.toLocaleString("pt-BR")} min`;
  const reasons = {
    "missing-data": "Indisponível: faltam dados da unidade",
    stale: "Indisponível: dados desatualizados",
    "insufficient-history": "Indisponível: ainda há poucos dados para calcular",
    "no-throughput": "Indisponível: nenhum atendimento começou no período analisado",
  };
  return reasons[estimate.reason];
}

/**
 * The estimate against the unit's own recent readings. `null` when there is
 * no current estimate to compare or the API does not send the comparison. It describes the reading: it says nothing
 * about other units and takes no part in color or ordering.
 */
export function describeWaitComparison(
  occupancy: UnitOccupancy,
): string | null {
  if (
    occupancy.confirmation === "stale" ||
    occupancy.waitEstimate?.status !== "available"
  )
    return null;
  switch (occupancy.waitComparison?.status) {
    case "above-usual":
      return "Acima do habitual desta unidade";
    case "usual":
      return "Dentro do habitual desta unidade";
    case "unavailable":
      return "Comparação indisponível: poucas leituras recentes";
    default:
      return null;
  }
}

/** How the color is chosen; completed attendances never take part. */
export const OCCUPANCY_EXPLANATION =
  "A cor compara a fila com quantas pessoas a unidade atende ao mesmo tempo. Leitos e atendimentos concluídos não mudam a cor.";

/** Legend note: the colors are the same as those of clinical triage. */
export const COLOR_NOTICE =
  "As cores não são classificação de risco: não indicam gravidade, ordem de atendimento nem qual unidade procurar.";

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

/** Visible and spoken queue level, consistent with the marker color. */
export function describeOccupancy(occupancy: UnitOccupancy): string {
  return STATUS_LABELS[occupancyStatus(occupancy)];
}

const BRASILIA_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Period of the completed attendances, in Brasília time. A whole Brasília day
 * (midnight to midnight, the end excluded) reads as that day; any other
 * period stays explicit.
 */
export function describeCompletedPeriod(
  completed: NonNullable<UnitAttendance["completed"]>,
): string {
  const start = new Date(completed.periodStart);
  const end = new Date(completed.periodEnd);
  const isWholeDay =
    end.getTime() - start.getTime() === BRASILIA_DAY_MS &&
    start.getUTCSeconds() === 0 &&
    start.getUTCMilliseconds() === 0 &&
    timeFormat.format(start) === "00:00";
  if (isWholeDay) return `em ${dayFormat.format(start)} (horário de Brasília)`;
  return `de ${formatDateTime(completed.periodStart)} a ${formatDateTime(completed.periodEnd)} (horário de Brasília)`;
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
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
    (value.installedServiceSlots === undefined ||
      (Number.isSafeInteger(value.installedServiceSlots) &&
        Number(value.installedServiceSlots) >= 1 &&
        (value.serviceSlots === undefined ||
          Number(value.serviceSlots) <=
            Number(value.installedServiceSlots)))) &&
    (value.services === undefined ||
      (Array.isArray(value.services) &&
        value.services.every(
          (code) =>
            typeof code === "string" && Object.hasOwn(SERVICE_LABELS, code),
        ) &&
        new Set(value.services).size === value.services.length)) &&
    (completed === undefined ||
      (isRecord(completed) &&
        isCount(completed.count) &&
        completed.count !== undefined &&
        isDateTime(completed.periodStart) &&
        isDateTime(completed.periodEnd)))
  );
}

function isWaitEstimate(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.status === "unavailable")
    return [
      "missing-data",
      "stale",
      "insufficient-history",
      "no-throughput",
    ].includes(String(value.reason));
  return (
    value.status === "available" &&
    value.method === "recent-start-rate" &&
    Number.isSafeInteger(value.minutes) &&
    Number(value.minutes) >= 0 &&
    Number.isSafeInteger(value.sampleCount) &&
    Number(value.sampleCount) >= 3 &&
    Number.isSafeInteger(value.started) &&
    Number(value.started) > 0 &&
    isDateTime(value.windowStart) &&
    isDateTime(value.windowEnd) &&
    Date.parse(String(value.windowStart)) < Date.parse(String(value.windowEnd))
  );
}

function isWaitComparison(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.status === "unavailable") return true;
  return (
    (value.status === "above-usual" || value.status === "usual") &&
    isCount(value.typicalMinutes) &&
    value.typicalMinutes !== undefined &&
    isCount(value.upperMinutes) &&
    value.upperMinutes !== undefined &&
    isCount(value.sampleCount) &&
    value.sampleCount !== undefined &&
    isDateTime(value.windowStart) &&
    isDateTime(value.windowEnd)
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
    isWaitEstimate(value.waitEstimate) &&
    isWaitComparison(value.waitComparison) &&
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

/**
 * Whether the server offers the layer. It reads no data, so the switch does
 * not wait for the national snapshot, loaded only when the layer is on.
 */
export async function fetchOccupancyAvailability(
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await fetch("/api/occupancy/availability", { signal });
  if (response.status === 404) return false;
  if (!response.ok)
    throw new Error("Não foi possível consultar a ocupação simulada.");
  return true;
}

/** `null` means the demonstration is turned off on this server (404). */
export async function fetchOccupancy(
  signal?: AbortSignal,
): Promise<OccupancyResponse | null> {
  const response = await fetch("/api/occupancy", { signal });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      "Não foi possível carregar a ocupação simulada.",
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
      "Não foi possível carregar o histórico da ocupação simulada.",
    );
  }
  return parseOccupancyHistory(await response.json());
}
