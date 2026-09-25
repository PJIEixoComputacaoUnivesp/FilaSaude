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

    expect(unit.location).toEqual({ latitude: -23.55, longitude: -46.63 });
  });

  it('discards coordinates outside the valid range', async () => {
    mockCnes([establishment(200, -300)]);

    const [unit] = await client.fetchUnits(parseState('SP'));

    expect(unit.location).toEqual({ latitude: null, longitude: null });
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
