import { Logger } from '@nestjs/common';
import { CnesClient } from './cnes.client.js';
import type { MunicipalitiesClient } from './municipalities.client.js';
import { parseState } from './states.js';

function establishment(
  latitude: number,
  longitude: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    codigo_cnes: 1234567,
    nome_fantasia: 'UPA Teste',
    codigo_tipo_unidade: 73,
    codigo_uf: 35,
    codigo_municipio: 355030,
    estabelecimento_faz_atendimento_ambulatorial_sus: 'SIM',
    latitude_estabelecimento_decimo_grau: latitude,
    longitude_estabelecimento_decimo_grau: longitude,
    data_atualizacao: '2026-09-20',
    ...overrides,
  };
}

/** Serves `records` for unit type 73 using CNES offset (record index) semantics. */
function mockCnes(records: unknown[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const params = new URL(String(input)).searchParams;
    const offset = Number(params.get('offset'));
    const limit = Number(params.get('limit'));
    const page =
      params.get('codigo_tipo_unidade') === '73'
        ? records.slice(offset, offset + limit)
        : [];
    return Promise.resolve(Response.json({ estabelecimentos: page }));
  });
}

describe('CnesClient', () => {
  const municipalities = {
    fetchNames: vi.fn().mockResolvedValue(
      new Map([
        ['355030', 'São Paulo'],
        ['330455', 'Rio de Janeiro'],
      ]),
    ),
  } as unknown as MunicipalitiesClient;
  const client = new CnesClient(municipalities);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps coordinates within the valid range', async () => {
    mockCnes([establishment(-23.55, -46.63)]);

    const [unit] = await client.fetchUnits(parseState('SP'));

    expect(unit.location).toEqual({
      latitude: -23.55,
      longitude: -46.63,
      precision: 'source',
      original: null,
      referenceMonth: null,
      correctedAt: null,
    });
  });

  it('exposes the 6-digit municipality code that links the unit to its boundary', async () => {
    mockCnes([establishment(-23.55, -46.63)]);

    const [unit] = await client.fetchUnits(parseState('SP'));

    expect(unit.address.municipalityCode).toBe('355030');
  });

  it('discards coordinates outside the valid range', async () => {
    mockCnes([establishment(200, -300)]);

    const [unit] = await client.fetchUnits(parseState('SP'));

    expect(unit.location).toEqual({
      latitude: null,
      longitude: null,
      precision: 'source',
      original: null,
      referenceMonth: null,
      correctedAt: null,
    });
  });

  it('fetches the whole country without a state filter', async () => {
    const fetch = mockCnes([
      establishment(-23.55, -46.63),
      establishment(-22.9, -43.2, {
        codigo_cnes: 7654321,
        nome_fantasia: 'UPA Rio',
        codigo_uf: 33,
        codigo_municipio: 330455,
      }),
    ]);

    const units = await client.fetchUnits(null);

    expect(
      fetch.mock.calls.every(
        ([input]) => !new URL(String(input)).searchParams.has('codigo_uf'),
      ),
    ).toBe(true);
    expect(units.map((unit) => unit.address)).toEqual([
      expect.objectContaining({ city: 'Rio de Janeiro', state: 'RJ' }),
      expect.objectContaining({ city: 'São Paulo', state: 'SP' }),
    ]);
  });

  it('skips invalid records instead of failing the whole collection', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    mockCnes([
      establishment(-23.55, -46.63),
      establishment(-22.9, -43.2, { codigo_cnes: 2, codigo_uf: 99 }),
      establishment(-22.9, -43.2, { codigo_cnes: 3, codigo_municipio: 1 }),
    ]);

    const units = await client.fetchUnits(null);

    expect(units.map((unit) => unit.id)).toEqual(['1234567']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipped 2 of 3 CNES records'),
    );
  });

  it('fails when every record is invalid', async () => {
    mockCnes([establishment(-23.55, -46.63, { codigo_uf: 99 })]);

    await expect(client.fetchUnits(null)).rejects.toThrow(
      'CNES returned no valid establishment',
    );
  });

  it('reads every page exactly once across concurrent batches', async () => {
    const records = Array.from({ length: 145 }, (_, index) =>
      establishment(-23.55, -46.63, {
        codigo_cnes: 1_000_000 + index,
        nome_fantasia: `UPA ${String(index).padStart(3, '0')}`,
      }),
    );
    mockCnes(records);

    const units = await client.fetchUnits(parseState('SP'));

    expect(units).toHaveLength(145);
    expect(new Set(units.map((unit) => unit.id)).size).toBe(145);
  });
});

describe('CnesClient.fetchUnit', () => {
  const municipalities = {
    fetchNames: vi.fn().mockResolvedValue(new Map([['355030', 'São Paulo']])),
  } as unknown as MunicipalitiesClient;
  const client = new CnesClient(municipalities);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const respondWith = (body: unknown, status = 200) =>
    vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          status === 200 ? Response.json(body) : new Response('', { status }),
        ),
      );

  it('returns the establishment normalized like the listing does', async () => {
    const fetch = respondWith(establishment(-23.55, -46.63));

    const unit = await client.fetchUnit('1234567');

    expect(String(fetch.mock.calls[0]![0])).toMatch(
      /\/cnes\/estabelecimentos\/1234567$/,
    );
    expect(unit).toMatchObject({
      id: '1234567',
      address: { municipalityCode: '355030', state: 'SP' },
      location: { latitude: -23.55, longitude: -46.63, precision: 'source' },
    });
  });

  it('returns null for an unknown establishment', async () => {
    respondWith(null, 404);

    expect(await client.fetchUnit('9999999')).toBeNull();
  });

  it('returns null for an establishment that is not an urgent care unit', async () => {
    respondWith(establishment(-23.55, -46.63, { codigo_tipo_unidade: 5 }));
    expect(await client.fetchUnit('1234567')).toBeNull();

    respondWith(
      establishment(-23.55, -46.63, {
        estabelecimento_faz_atendimento_ambulatorial_sus: 'NAO',
      }),
    );
    expect(await client.fetchUnit('1234567')).toBeNull();
  });

  it('fails on a malformed record instead of reporting it as missing', async () => {
    respondWith(establishment(-23.55, -46.63, { nome_fantasia: '' }));

    await expect(client.fetchUnit('1234567')).rejects.toThrow(
      'invalid nome_fantasia',
    );
  });

  it('fails on an HTTP error', async () => {
    respondWith(null, 503);

    await expect(client.fetchUnit('1234567')).rejects.toThrow('status 503');
  });

  it('refuses a record for a different establishment than the one asked for', async () => {
    respondWith(establishment(-23.55, -46.63, { codigo_cnes: 7654321 }));

    await expect(client.fetchUnit('1234567')).rejects.toThrow(
      'different establishment',
    );
  });

  it('accepts the code asked for without its leading zeros', async () => {
    respondWith(establishment(-23.55, -46.63, { codigo_cnes: 113360 }));

    await expect(client.fetchUnit('113360')).resolves.toMatchObject({
      id: '0113360',
    });
  });

  it('refuses a code that is not numeric before calling CNES', async () => {
    const fetch = respondWith({});

    await expect(client.fetchUnit('../health')).rejects.toThrow(
      'Invalid CNES code',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
