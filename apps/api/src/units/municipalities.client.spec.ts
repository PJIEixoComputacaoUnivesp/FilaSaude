import { Logger } from '@nestjs/common';
import { MunicipalitiesClient } from './municipalities.client.js';
import { parseState } from './states.js';

describe('MunicipalitiesClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the current municipality names returned by IBGE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json([{ id: 3550308, nome: 'São Paulo atual' }]),
    );

    const names = await new MunicipalitiesClient().fetchNames(parseState('SP'));

    expect(names).toEqual(new Map([['355030', 'São Paulo atual']]));
  });

  it('uses embedded public names when IBGE is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('TLS failed'));
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const names = await new MunicipalitiesClient().fetchNames(parseState('SP'));

    expect(names.get('355030')).toBe('São Paulo');
    expect(names.size).toBeGreaterThan(100);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('using embedded names for SP'),
    );
  });

  it('can build the national fallback without calling another source', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unavailable'));
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const names = await new MunicipalitiesClient().fetchNames(null);

    expect(names.get('355030')).toBe('São Paulo');
    expect(names.get('330455')).toBe('Rio de Janeiro');
  });
});
