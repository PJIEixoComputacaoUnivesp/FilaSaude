import { signSnapshot } from './signing.ts';
import type { OccupancySnapshot } from './simulation.ts';

const WEBHOOK_PATH = '/webhooks/v1/occupancy';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

export interface SnapshotTransportOptions {
  apiUrl: string;
  sourceId: string;
  sourceSecret: string | null;
  maxAttempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => Date;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface SnapshotTransportResult {
  attempts: number;
  status: number;
}

export class SnapshotTransportHttpError extends Error {
  readonly status: number;
  readonly attempts: number;

  constructor(
    status: number,
    attempts = 1,
    message = `Webhook rejeitado pela API com status ${status}.`,
  ) {
    super(message);
    this.name = 'SnapshotTransportHttpError';
    this.status = status;
    this.attempts = attempts;
  }
}

export async function sendSnapshot(
  snapshot: OccupancySnapshot,
  options: SnapshotTransportOptions,
): Promise<SnapshotTransportResult> {
  if (!options.sourceSecret) {
    throw new Error('SIMULATOR_SOURCE_SECRET é obrigatória para enviar snapshots.');
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts deve ser um inteiro positivo.');
  }

  const rawBody = JSON.stringify(snapshot);
  const url = new URL(WEBHOOK_PATH, options.apiUrl);
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? delay;
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = options.signal;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  let lastTimestamp = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timestamp = nextTimestamp(now, lastTimestamp);
    lastTimestamp = timestamp;
    const signature = signSnapshot(
      options.sourceSecret,
      timestamp.toString(),
      rawBody,
    );

    let response: Response;
    try {
      response = await postSnapshot(
        fetchImpl,
        url,
        rawBody,
        options.sourceId,
        timestamp,
        signature,
        timeoutMs,
        signal,
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === maxAttempts) break;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs), signal);
      continue;
    }

    if (response.ok) return { attempts: attempt, status: response.status };
    if (!isRetryable(response.status)) {
      throw new SnapshotTransportHttpError(response.status, attempt);
    }
    if (attempt === maxAttempts) {
      throw new SnapshotTransportHttpError(
        response.status,
        attempt,
        `Webhook não aceito após ${attempt} tentativas.`,
      );
    }

    await sleep(
      response.status === 429
        ? retryAfterDelay(response)
        : backoffDelay(attempt, baseDelayMs, maxDelayMs),
      signal,
    );
  }

  throw new Error(
    `Não foi possível enviar o webhook após ${maxAttempts} tentativas.`,
    { cause: lastError },
  );
}

async function postSnapshot(
  fetchImpl: typeof fetch,
  url: URL,
  rawBody: string,
  sourceId: string,
  timestamp: number,
  signature: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': sourceId,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Webhook-Signature': `sha256=${signature}`,
      },
      body: rawBody,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

function nextTimestamp(now: () => Date, previous: number): number {
  return Math.max(Math.floor(now().getTime() / 1000), previous + 1);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryAfterDelay(response: Response): number {
  const value = response.headers.get('retry-after');
  const seconds = value && /^\d+$/.test(value) ? Number(value) : 1;
  return seconds * 1000;
}

function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Envio cancelado.'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
