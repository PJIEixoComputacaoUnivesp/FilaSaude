import { CnesClient } from './cnes.client.js';
import { GeoSampaClient } from './geosampa.client.js';
import { UnitsService } from './units.service.js';
import type { HealthUnit } from './units.types.js';

const liveUnit: HealthUnit = {
  id: '1234567',
  name: 'UPA Teste',
  unitType: 'PRONTO ATENDIMENTO',
  address: {
    street: 'Rua Teste',
    number: '10',
    district: 'Centro',
    postalCode: '01001000',
    city: 'São Paulo',
    state: 'SP',
  },
  location: { latitude: -23.55, longitude: -46.63 },
  serviceHours: 'ATENDIMENTO CONTINUO DE 24 HORAS/DIA',
  lastUpdatedAt: '2026-09-20',
  sources: [
    {
      name: 'Cadastro Nacional de Estabelecimentos de Saúde (CNES)',
      url: 'https://example.com/cnes',
      fields: ['identity', 'address', 'location', 'serviceHours'],
      lastUpdatedAt: '2026-09-20',
    },
  ],
};

function createGeoSampaClient() {
  return {
    enrichLocations: vi.fn().mockImplementation((units) => units),
  } as unknown as GeoSampaClient;
}

describe('UnitsService', () => {
  it('returns and caches live CNES data', async () => {
    const fetchUnits = vi.fn().mockResolvedValue([liveUnit]);
    const client = { fetchUnits } as unknown as CnesClient;
    const geoSampaClient = createGeoSampaClient();
    const service = new UnitsService(client, geoSampaClient);

    const first = await service.findAll('SP');
    const second = await service.findAll('sp');

    expect(first.data).toEqual([liveUnit]);
    expect(first.metadata).toMatchObject({
      count: 1,
      state: 'SP',
      dataOrigin: 'live',
      isStale: false,
      latestSourceUpdate: '2026-09-20',
    });
    expect(second).toBe(first);
    expect(fetchUnits).toHaveBeenCalledTimes(1);
    expect(geoSampaClient.enrichLocations).toHaveBeenCalledWith([liveUnit]);
  });

  it('shares an in-flight CNES request for the same state', async () => {
    let resolveFetch: ((units: HealthUnit[]) => void) | undefined;
    const fetchUnits = vi.fn().mockImplementation(
      () =>
        new Promise<HealthUnit[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = { fetchUnits } as unknown as CnesClient;
    const service = new UnitsService(client, createGeoSampaClient());

    const first = service.findAll('SP');
    const second = service.findAll('SP');

    expect(fetchUnits).toHaveBeenCalledTimes(1);
    resolveFetch?.([liveUnit]);
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(secondResponse).toBe(firstResponse);
  });

  it('returns the snapshot when CNES is unavailable', async () => {
    const client = {
      fetchUnits: vi.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as CnesClient;
    const service = new UnitsService(client, createGeoSampaClient());

    const response = await service.findAll('SP');

    expect(response.data.length).toBeGreaterThan(0);
    expect(response.metadata).toMatchObject({
      dataOrigin: 'fallback',
      isStale: true,
    });
  });

  it('returns the last live response as stale when CNES fails after the cache expires', async () => {
    vi.useFakeTimers();
    try {
      const fetchUnits = vi
        .fn()
        .mockResolvedValueOnce([liveUnit])
        .mockRejectedValueOnce(new Error('unavailable'));
      const client = { fetchUnits } as unknown as CnesClient;
      const service = new UnitsService(client, createGeoSampaClient());

      const live = await service.findAll('RJ');
      vi.advanceTimersByTime(7 * 60 * 60 * 1000);
      const stale = await service.findAll('RJ');

      expect(stale.data).toEqual([liveUnit]);
      expect(stale.metadata).toMatchObject({
        dataOrigin: 'live',
        isStale: true,
        retrievedAt: live.metadata.retrievedAt,
      });
      expect(fetchUnits).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an invalid state before calling CNES', async () => {
    const fetchUnits = vi.fn();
    const client = { fetchUnits } as unknown as CnesClient;
    const service = new UnitsService(client, createGeoSampaClient());

    await expect(service.findAll('XX')).rejects.toThrow(
      'Invalid Brazilian state abbreviation',
    );
    expect(fetchUnits).not.toHaveBeenCalled();
  });

  it('returns all country units for ALL/BR', async () => {
    const fetchUnits = vi.fn();
    const client = { fetchUnits } as unknown as CnesClient;
    const geoSampaClient = createGeoSampaClient();
    const service = new UnitsService(client, geoSampaClient);

    const response = await service.findAll('ALL');
    expect(response.data.length).toBeGreaterThan(1000);
    expect(response.metadata.state).toBe('BR');
    expect(response.metadata.dataOrigin).toBe('fallback');
    expect(fetchUnits).not.toHaveBeenCalled();
    expect(geoSampaClient.enrichLocations).not.toHaveBeenCalled();
  });

  it('keeps CNES locations when GeoSampa is unavailable', async () => {
    const client = {
      fetchUnits: vi.fn().mockResolvedValue([liveUnit]),
    } as unknown as CnesClient;
    const geoSampaClient = {
      enrichLocations: vi.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as GeoSampaClient;
    const service = new UnitsService(client, geoSampaClient);

    const response = await service.findAll('SP');

    expect(response.data).toEqual([liveUnit]);
    expect(response.metadata.dataOrigin).toBe('live');
  });
});
