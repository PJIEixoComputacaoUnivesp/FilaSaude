import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MAX_REQUESTS_PER_WINDOW = 60;
export const WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;

export class WebhookRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        code: 'rate_limit_exceeded',
        message: 'Limite temporário de requisições excedido.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

interface RateLimitWindow {
  startedAt: number;
  count: number;
}

@Injectable()
export class WebhookRateLimiterService {
  private readonly windows = new Map<string, RateLimitWindow>();

  allow(sourceId: string, now = Date.now()): boolean {
    const current = this.windows.get(sourceId);
    if (
      !current ||
      now - current.startedAt >= WEBHOOK_RATE_LIMIT_WINDOW_MS
    ) {
      this.windows.set(sourceId, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
    current.count += 1;
    return true;
  }

  retryAfterSeconds(sourceId: string, now = Date.now()): number {
    const current = this.windows.get(sourceId);
    if (!current) return 1;

    return Math.max(
      1,
      Math.ceil(
        (WEBHOOK_RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000,
      ),
    );
  }
}
