import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { WebhookAuthenticationService } from './webhook-authentication.service.js';
import type { WebhookSourceConfigService } from './webhook-source-config.service.js';

describe('WebhookAuthenticationService', () => {
  const source = {
    secret: 'test-secret',
    unitCnes: ['1234567'],
  };
  const config = {
    find: vi.fn().mockReturnValue(source),
  } as unknown as WebhookSourceConfigService;
  const service = new WebhookAuthenticationService(config);
  const rawBody = Buffer.from('{"type":"occupancy.snapshot.v1"}');
  const timestamp = '1790000000';

  it('accepts an HMAC over the timestamp and raw body', () => {
    const signature = createHmac('sha256', source.secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');

    expect(
      service.authenticate(
        'academic-simulator',
        timestamp,
        `sha256=${signature}`,
        rawBody,
        new Date(1790000000 * 1000),
      ),
    ).toBe('academic-simulator');
  });

  it('accepts the documented signature vector', () => {
    const vectorSecret = 'test-secret-for-occupancy-vector-2026';
    const vectorBody = Buffer.from(
      '{"eventId":"01K5T2S6C4TZ1K9TR6F89A2M7X","type":"occupancy.snapshot.v1","unitCnes":"1234567","occurredAt":"2026-09-25T14:30:00Z","observedAt":"2026-09-25T14:30:05Z","categories":[{"code":"observation","capacity":20,"occupied":13}]}',
    );
    const vectorTimestamp = '1790000000';
    const vectorConfig = {
      find: vi.fn().mockReturnValue({
        secret: vectorSecret,
        unitCnes: ['1234567'],
      }),
    } as unknown as WebhookSourceConfigService;
    const vectorService = new WebhookAuthenticationService(vectorConfig);

    expect(
      vectorService.authenticate(
        'academic-simulator',
        vectorTimestamp,
        'sha256=da56c33183345cfa94a63775704a2b52655350b77dae47c84a836db888cc62e5',
        vectorBody,
        new Date(1790000000 * 1000),
      ),
    ).toBe('academic-simulator');
  });

  it('rejects an invalid signature without exposing cryptographic details', () => {
    expect(() =>
      service.authenticate(
        'academic-simulator',
        timestamp,
        `sha256=${'0'.repeat(64)}`,
        rawBody,
        new Date(1790000000 * 1000),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects missing authentication headers', () => {
    expect(() =>
      service.authenticate(
        undefined,
        timestamp,
        'sha256=' + '0'.repeat(64),
        rawBody,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an unknown source', () => {
    vi.mocked(config.find).mockReturnValue(undefined);

    expect(() =>
      service.authenticate(
        'unknown-source',
        timestamp,
        'sha256=' + '0'.repeat(64),
        rawBody,
        new Date(1790000000 * 1000),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a signature without the sha256 prefix', () => {
    expect(() =>
      service.authenticate(
        'academic-simulator',
        timestamp,
        '0'.repeat(64),
        rawBody,
        new Date(1790000000 * 1000),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a timestamp outside the tolerance', () => {
    const signature = createHmac('sha256', source.secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');

    expect(() =>
      service.authenticate(
        'academic-simulator',
        timestamp,
        `sha256=${signature}`,
        rawBody,
        new Date((1790000000 + 301) * 1000),
      ),
    ).toThrow(UnauthorizedException);
  });
});
