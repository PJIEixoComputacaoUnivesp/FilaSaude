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

  it('rejects a timestamp outside the tolerance', () => {
    expect(() =>
      service.authenticate(
        'academic-simulator',
        timestamp,
        `sha256=${'0'.repeat(64)}`,
        rawBody,
        new Date((1790000000 + 301) * 1000),
      ),
    ).toThrow(UnauthorizedException);
  });
});
