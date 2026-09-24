import { CnesClient } from './cnes.client.js';
import type { MunicipalitiesClient } from './municipalities.client.js';
import { parseState } from './states.js';

function establishment(latitude: number, longitude: number) {
  return {
    codigo_cnes: 1234567,
    nome_fantasia: 'UPA Teste',
    codigo_tipo_unidade: 73,
    codigo_municipio: 355030,
    estabelecimento_faz_atendimento_ambulatorial_sus: 'SIM',
    latitude_estabelecimento_decimo_grau: latitude,
    longitude_estabelecimento_decimo_grau: longitude,
    data_atualizacao: '2026-09-20',
  };
}

function mockCnes(records: unknown[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const unitType = new URL(String(input)).searchParams.get(
      'codigo_tipo_unidade',
    );
    return Promise.resolve(
      Response.json({ estabelecimentos: unitType === '73' ? records : [] }),
    );
  });
}

describe('CnesClient', () => {
  const municipalities = {
    fetchNames: vi.fn().mockResolvedValue(new Map([['355030', 'São Paulo']])),
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
});
