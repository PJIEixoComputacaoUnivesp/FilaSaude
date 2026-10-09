import { WebhookSourceConfigService } from './webhook-source-config.service.js';

describe('WebhookSourceConfigService', () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SOURCE_CONFIG;
  });

  it('reads a source secret and its authorized CNES units', () => {
    vi.stubEnv(
      'WEBHOOK_SOURCE_CONFIG',
      JSON.stringify({
        'academic-simulator': {
          secret: 'a-secret',
          unitCnes: ['1234567', '7654321'],
        },
      }),
    );

    expect(new WebhookSourceConfigService().find('academic-simulator')).toEqual({
      secret: 'a-secret',
      unitCnes: ['1234567', '7654321'],
    });
  });

  it.each([
    ['malformed JSON', '{'],
    [
      'a source without a secret',
      JSON.stringify({ source: { unitCnes: ['1234567'] } }),
    ],
    [
      'a source with an invalid CNES',
      JSON.stringify({ source: { secret: 'secret', unitCnes: ['123'] } }),
    ],
  ])('rejects %s', (_description, value) => {
    vi.stubEnv('WEBHOOK_SOURCE_CONFIG', value);

    expect(() => new WebhookSourceConfigService()).toThrow(
      /WEBHOOK_SOURCE_CONFIG/,
    );
  });

  it('does not expose an unconfigured source', () => {
    vi.stubEnv(
      'WEBHOOK_SOURCE_CONFIG',
      JSON.stringify({ source: { secret: 'secret', unitCnes: [] } }),
    );

    expect(new WebhookSourceConfigService().find('other-source')).toBeUndefined();
  });
});
