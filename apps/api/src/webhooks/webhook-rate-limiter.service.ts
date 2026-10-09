import { Injectable } from '@nestjs/common';

const MAX_REQUESTS_PER_WINDOW = 60;
const WINDOW_MS = 60_000;

interface RateLimitWindow {
  startedAt: number;
  count: number;
}

@Injectable()
export class WebhookRateLimiterService {
  private readonly windows = new Map<string, RateLimitWindow>();

  allow(sourceId: string, now = Date.now()): boolean {
    const current = this.windows.get(sourceId);
    if (!current || now - current.startedAt >= WINDOW_MS) {
      this.windows.set(sourceId, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
    current.count += 1;
    return true;
  }
}
