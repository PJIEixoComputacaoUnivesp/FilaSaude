import { GeoSampaClient } from './geosampa.client.js';
import type { HealthUnit } from './units.types.js';

function unit(overrides: Partial<HealthUnit> = {}): HealthUnit {
  return {
    id: '1234567',
    name: 'AMA CAPAO REDONDO',
    unitType: 'PRONTO ATENDIMENTO',
    address: {
      street: 'Avenida Comendador Santana',
      number: '774',
      district: 'Capão Redondo',
      postalCode: '05866000',
      city: 'São Paulo',
      state: 'SP',
    },
    location: { latitude: -23.6420677, longitude: -46.7532547 },
    serviceHours: null,
    lastUpdatedAt: '2026-09-20',
    sources: [
      {
        name: 'Cadastro Nacional de Estabelecimentos de Saúde (CNES)',
        url: 'https://example.com/cnes',
        fields: ['identity', 'address', 'location', 'serviceHours'],
        lastUpdatedAt: '2026-09-20',
      },
    ],
    ...overrides,
  };
}

function feature(
  name = 'AMA 24H CAPÃO REDONDO',
  postalCode = '05866-000',
  coordinates = [-46.773638, -23.67512701],
) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      nm_equipamento: name,
      cd_cep_equipamento: postalCode,
    },
  };
}

describe('GeoSampaClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses a unique name and postal-code match as the location source', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ type: 'FeatureCollection', features: [feature()] }),
        ),
    );

    const [enriched] = await new GeoSampaClient().enrichLocations([unit()]);

    expect(enriched.location).toEqual({
      latitude: -23.67512701,
      longitude: -46.773638,
    });
    expect(enriched.sources).toEqual([
      expect.objectContaining({
        name: expect.stringContaining('CNES'),
        fields: ['identity', 'address', 'serviceHours'],
      }),
      expect.objectContaining({
        name: 'GeoSampa — Urgência / Emergência',
        fields: ['location'],
      }),
    ]);
  });

  it('accepts a strong name match within 100 meters when the postal code differs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          type: 'FeatureCollection',
          features: [
            feature(
              'UPA CAMPO LIMPO - DR FERNANDO MAURO PROENÇA DE GOUVEA',
              '05835-005',
              [-46.7681, -23.6501],
            ),
          ],
        }),
      ),
    );
    const source = unit({
      name: 'UPA CAMPO LIMPO DR FERNANDO PRO',
      address: { ...unit().address, postalCode: '05846420' },
      location: { latitude: -23.65, longitude: -46.768 },
    });

    const [enriched] = await new GeoSampaClient().enrichLocations([source]);

    expect(enriched.sources).toHaveLength(2);
    expect(enriched.location.latitude).toBe(-23.6501);
  });

  it('does not enrich an ambiguous or weak match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          type: 'FeatureCollection',
          features: [feature(), feature('AMA 24H CAPAO REDONDO - ANEXO')],
        }),
      ),
    );
    const source = unit();

    const [result] = await new GeoSampaClient().enrichLocations([source]);

    expect(result).toBe(source);
  });

  it('does not assign one GeoSampa record to two CNES units', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ type: 'FeatureCollection', features: [feature()] }),
        ),
    );
    const first = unit();
    const second = unit({ id: '7654321' });

    const result = await new GeoSampaClient().enrichLocations([first, second]);

    expect(result).toEqual([first, second]);
  });

  it('does not assign a candidate shared with an ambiguously matched unit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          type: 'FeatureCollection',
          features: [
            feature('UNIDADE ALFA', '01001-001', [-46.768, -23.65]),
            feature('UNIDADE BETA', '01001-002', [-46.7681, -23.6501]),
          ],
        }),
      ),
    );
    const ambiguous = unit({
      name: 'UNIDADE ALFA BETA',
      address: { ...unit().address, postalCode: '01001-003' },
      location: { latitude: -23.65, longitude: -46.768 },
    });
    const apparentlyUnique = unit({
      id: '7654321',
      name: 'UNIDADE ALFA',
      address: { ...unit().address, postalCode: '01001-004' },
      location: { latitude: -23.65, longitude: -46.768 },
    });

    const result = await new GeoSampaClient().enrichLocations([
      ambiguous,
      apparentlyUnique,
    ]);

    expect(result).toEqual([ambiguous, apparentlyUnique]);
  });

  it('ignores units outside the city of São Paulo', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ type: 'FeatureCollection', features: [feature()] }),
        ),
    );
    const source = unit({
      address: { ...unit().address, city: 'Osasco' },
    });

    const [result] = await new GeoSampaClient().enrichLocations([source]);

    expect(result).toBe(source);
  });
});
