import { WebhookRateLimiterService } from './webhook-rate-limiter.service.js';

describe('WebhookRateLimiterService', () => {
  it('allows 60 requests and rejects the next one in the same minute', () => {
    const service = new WebhookRateLimiterService();

    expect(
      Array.from({ length: 60 }, () => service.allow('source', 1_000)),
    ).toEqual(Array(60).fill(true));
    expect(service.allow('source', 1_000)).toBe(false);
  });

  it('starts a new window after one minute', () => {
    const service = new WebhookRateLimiterService();

    for (let index = 0; index < 60; index += 1) {
      service.allow('source', 1_000);
    }

    expect(service.allow('source', 61_000)).toBe(true);
  });

  it('keeps independent windows for different sources', () => {
    const service = new WebhookRateLimiterService();

    for (let index = 0; index < 60; index += 1) {
      service.allow('source-a', 1_000);
    }

    expect(service.allow('source-a', 1_000)).toBe(false);
    expect(service.allow('source-b', 1_000)).toBe(true);
  });
});
