import { CnesHistoryClient } from './cnes-history.client.js';

function release(overrides: Record<string, unknown> = {}) {
  return {
    nu_comp: 202511,
    co_cnes: '5563704',
    no_logradouro: 'RUA SERRA AGULHAS NEGRAS',
    nu_endereco: '100',
    nu_latitude: -23.535249,
    nu_longitude: -46.841459,
    ...overrides,
  };
}

function respondWith(records: unknown[]) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(Response.json({ cnes_estabelecimentos: records })),
    );
}

describe('CnesHistoryClient', () => {
  const client = new CnesHistoryClient();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses the monthly releases of a unit', async () => {
    respondWith([release()]);

    expect(await client.fetch('5563704')).toEqual([
      {
        referenceMonth: '2025-11',
        latitude: -23.535249,
        longitude: -46.841459,
        street: 'RUA SERRA AGULHAS NEGRAS',
        number: '100',
      },
    ]);
  });

  it('queries by the 7-digit code, which the API matches as text', async () => {
    const fetch = respondWith([]);

    await client.fetch('0113360');

    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.searchParams.get('co_cnes')).toBe('0113360');
    expect(url.searchParams.get('limit')).toBe('1000');
  });

  it('accepts releases whose code is padded in the response', async () => {
    respondWith([release({ co_cnes: '0113360' })]);

    expect(await client.fetch('0113360')).toHaveLength(1);
  });

  it('drops rows of other establishments, as unknown filters are ignored', async () => {
    respondWith([release(), release({ co_cnes: '7308205', nu_comp: 201408 })]);

    const entries = await client.fetch('5563704');

    expect(entries).toHaveLength(1);
    expect(entries[0]!.referenceMonth).toBe('2025-11');
  });

  it('drops releases with an invalid month and keeps missing coordinates as null', async () => {
    respondWith([
      release({ nu_comp: 202513 }),
      release({ nu_comp: 'x' }),
      release({ nu_latitude: null, nu_longitude: 500 }),
    ]);

    const entries = await client.fetch('5563704');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ latitude: null, longitude: null });
  });

  it('pages by record index until a short page', async () => {
    const all = Array.from({ length: 1001 }, (_, index) =>
      release({ nu_comp: 200801 + (index % 12) }),
    );
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const offset = Number(new URL(String(input)).searchParams.get('offset'));
      return Promise.resolve(
        Response.json({
          cnes_estabelecimentos: all.slice(offset, offset + 1000),
        }),
      );
    });

    const entries = await client.fetch('5563704');

    expect(entries).toHaveLength(1001);
    expect(
      fetch.mock.calls.map(([input]) =>
        new URL(String(input)).searchParams.get('offset'),
      ),
    ).toEqual(['0', '1000']);
  });

  it('fails on an HTTP error or an unexpected payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 503 }),
    );
    await expect(client.fetch('5563704')).rejects.toThrow('status 503');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}));
    await expect(client.fetch('5563704')).rejects.toThrow(
      'unexpected response',
    );
  });
});
