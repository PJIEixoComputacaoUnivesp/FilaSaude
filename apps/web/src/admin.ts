/**
 * Access to the admin API and the rules the admin form shares with it. The
 * token only ever lives in the caller's memory: it is passed to each call and
 * never stored here.
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface Correction extends Coordinate {
  cnesCode: string;
  verifiedBy: string;
  method: string;
  correctedAt: string;
}

export type CorrectionAction = "set" | "replace" | "remove";

export interface CorrectionEvent {
  id: number;
  action: CorrectionAction;
  actor: string;
  occurredAt: string;
  method: string | null;
  previous: Coordinate | null;
  next: Coordinate | null;
}

export type AdminErrorKind =
  | "disabled"
  | "unauthorized"
  | "invalid"
  | "notFound"
  | "outsideMunicipality"
  | "tooManyAttempts"
  | "unavailable"
  | "network"
  | "unexpected";

export class AdminApiError extends Error {
  readonly kind: AdminErrorKind;

  constructor(kind: AdminErrorKind) {
    super(kind);
    this.name = "AdminApiError";
    this.kind = kind;
  }
}

/** What the person sees. The API's own messages are never shown. */
export function adminErrorMessage(
  kind: AdminErrorKind,
  action: "signIn" | "save" | "remove" | "read" = "read",
): string {
  switch (kind) {
    case "disabled":
      return "A administração está desligada neste ambiente.";
    case "unauthorized":
      return action === "signIn"
        ? "Token inválido. Confira o valor que recebeu."
        : "Sua sessão não é mais válida. Entre novamente.";
    case "invalid":
      return "Os dados enviados são inválidos. Confira o código CNES, as coordenadas e o texto.";
    case "notFound":
      return action === "remove"
        ? "Esta unidade não tem posição corrigida."
        : "Unidade não encontrada entre as de pronto atendimento do CNES.";
    case "outsideMunicipality":
      return "A posição está fora do município da unidade. Confira a latitude e a longitude.";
    case "tooManyAttempts":
      return action === "signIn"
        ? "Token inválido. O servidor está recebendo muitas tentativas inválidas; confira o valor que recebeu."
        : "Muitas tentativas inválidas. Aguarde alguns minutos e tente de novo.";
    case "unavailable":
      return "O CNES ou os contornos do IBGE estão indisponíveis agora. Tente novamente em instantes.";
    case "network":
      return "Não foi possível falar com o servidor. Verifique a conexão.";
    case "unexpected":
      return "Algo deu errado no servidor. Tente novamente.";
  }
}

function kindOfStatus(status: number): AdminErrorKind {
  switch (status) {
    case 400:
      return "invalid";
    case 401:
      return "unauthorized";
    case 404:
      return "notFound";
    case 422:
      return "outsideMunicipality";
    case 429:
      return "tooManyAttempts";
    case 503:
      return "unavailable";
    default:
      return "unexpected";
  }
}

async function request(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined && { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new AdminApiError("network");
  }
  if (!response.ok) throw new AdminApiError(kindOfStatus(response.status));
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    isRecord(value) &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number"
  );
}

export function isCorrection(value: unknown): value is Correction {
  return (
    isRecord(value) &&
    typeof value.cnesCode === "string" &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    typeof value.verifiedBy === "string" &&
    typeof value.method === "string" &&
    typeof value.correctedAt === "string"
  );
}

export function isCorrectionEvent(value: unknown): value is CorrectionEvent {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    (value.action === "set" ||
      value.action === "replace" ||
      value.action === "remove") &&
    typeof value.actor === "string" &&
    typeof value.occurredAt === "string" &&
    (value.method === null || typeof value.method === "string") &&
    (value.previous === null || isCoordinate(value.previous)) &&
    (value.next === null || isCoordinate(value.next))
  );
}

async function readList<T>(
  response: Response,
  isItem: (value: unknown) => value is T,
): Promise<T[]> {
  const payload: unknown = await response.json().catch(() => null);
  if (!Array.isArray(payload) || !payload.every(isItem)) {
    throw new AdminApiError("unexpected");
  }
  return payload;
}

/** Validates a token and says whose it is. The server answers 404 when the administration is off. */
export async function fetchAdminLogin(token: string): Promise<string> {
  try {
    const response = await request(token, "/me");
    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || typeof payload.login !== "string") {
      throw new AdminApiError("unexpected");
    }
    return payload.login;
  } catch (error) {
    if (error instanceof AdminApiError && error.kind === "notFound") {
      throw new AdminApiError("disabled");
    }
    throw error;
  }
}

export async function listCorrections(token: string): Promise<Correction[]> {
  return readList(
    await request(token, "/location-corrections"),
    isCorrection,
  );
}

export async function listCorrectionEvents(
  token: string,
  cnesCode: string,
): Promise<CorrectionEvent[]> {
  return readList(
    await request(token, `/location-corrections/${cnesCode}/events`),
    isCorrectionEvent,
  );
}

export async function saveCorrection(
  token: string,
  cnesCode: string,
  input: Coordinate & { method: string },
): Promise<void> {
  await request(token, `/location-corrections/${cnesCode}`, {
    method: "PUT",
    body: input,
  });
}

export async function removeCorrection(
  token: string,
  cnesCode: string,
): Promise<void> {
  await request(token, `/location-corrections/${cnesCode}`, {
    method: "DELETE",
  });
}

// ---- the form's rules, which mirror what the API accepts ----

export const LATITUDE_RANGE = [-34, 6] as const;
export const LONGITUDE_RANGE = [-75, -28] as const;
export const METHOD_MAX_LENGTH = 500;

// Maps and word processors paste U+2212 and dashes where a minus is expected.
const MINUS_SIGNS = /[−–—]/g;

/** "-23,5343", "-23.5343" and "−23,5343" (U+2212) all read as -23.5343. */
export function parseCoordinate(text: string): number | null {
  const normalized = text.trim().replace(MINUS_SIGNS, "-").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/**
 * Splits a pasted "latitude, longitude" pair, as a map copies it, in either
 * decimal notation. Anything that is not exactly two numbers is left alone.
 */
const NUMBER = "-?\\d+(?:[.,]\\d+)?";
const PAIR = new RegExp(
  `^\\s*\\(?\\s*(${NUMBER})(?![.,]\\d)\\s*(?:[;,]|\\s)\\s*(${NUMBER})\\s*\\)?\\s*$`,
);

export function extractCoordinatePair(text: string): [string, string] | null {
  const match = PAIR.exec(text.replace(MINUS_SIGNS, "-"));
  return match ? [match[1]!, match[2]!] : null;
}

/** A clicked point, in the form the fields take: 6 decimals, comma. */
export function formatCoordinateInput(value: number): string {
  return value.toFixed(6).replace(".", ",");
}

export function coordinateError(
  text: string,
  kind: "latitude" | "longitude",
): string | null {
  const value = parseCoordinate(text);
  const [min, max] = kind === "latitude" ? LATITUDE_RANGE : LONGITUDE_RANGE;
  const name = kind === "latitude" ? "A latitude" : "A longitude";
  if (text.trim() === "") return `${name} é obrigatória.`;
  if (value === null) return `${name} deve ser um número, como -23,5343.`;
  if (value < min || value > max) {
    return `${name} deve estar entre ${min} e ${max}, dentro do Brasil.`;
  }
  return null;
}

/** Line breaks and tabs are text; other control characters are not accepted. */
function hasControlCharacters(text: string): boolean {
  return [...text].some((character) => {
    const code = character.charCodeAt(0);
    return (
      (code < 0x20 && code !== 0x0a && code !== 0x0d && code !== 0x09) ||
      code === 0x7f
    );
  });
}

export function methodError(text: string): string | null {
  const length = text.trim().length;
  if (length === 0) return "Descreva como a posição foi verificada.";
  if (length > METHOD_MAX_LENGTH) {
    return `Use no máximo ${METHOD_MAX_LENGTH} caracteres.`;
  }
  if (hasControlCharacters(text)) {
    return "O texto tem caracteres especiais que não são aceitos. Use só letras, números e pontuação.";
  }
  return null;
}

/** The 7-digit CNES code, from what was typed, or null when it is not one. */
export function normalizeCnesCode(text: string): string | null {
  const digits = text.trim();
  return /^\d{1,7}$/.test(digits) ? digits.padStart(7, "0") : null;
}

export function formatCoordinate({ latitude, longitude }: Coordinate): string {
  const format = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
  return `${format.format(latitude)}, ${format.format(longitude)}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(date);
}

export function actionLabel(action: CorrectionAction): string {
  switch (action) {
    case "set":
      return "Definida";
    case "replace":
      return "Substituída";
    case "remove":
      return "Removida";
  }
}
