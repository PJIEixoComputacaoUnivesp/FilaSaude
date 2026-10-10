import { CnesClient } from './cnes.client.js';
import { GeoSampaClient } from './geosampa.client.js';
import { UnitsService } from './units.service.js';
import type { UnitLocationsService } from './unit-locations.service.js';
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
    municipalityCode: '355030',
    city: 'São Paulo',
    state: 'SP',
  },
  location: {
    latitude: -23.55,
    longitude: -46.63,
    precision: 'source',
    original: null,
    referenceMonth: null,
    correctedAt: null,
  },
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

const passthrough = {
  apply: vi.fn((units: HealthUnit[]) =>
    Promise.resolve({ units, validated: true, historyComplete: true }),
  ),
} as unknown as UnitLocationsService;

function createGeoSampaClient() {
  return {
    enrichLocations: vi.fn((units: HealthUnit[]) => Promise.resolve(units)),
  } as unknown as GeoSampaClient;
}

function createService(
  client: CnesClient,
  locations: UnitLocationsService,
  geoSampaClient = createGeoSampaClient(),
) {
  return new UnitsService(client, locations, geoSampaClient);
}

describe('UnitsService', () => {
  it('returns and caches live CNES data', async () => {
    const fetchUnits = vi.fn().mockResolvedValue([liveUnit]);
    const client = { fetchUnits } as unknown as CnesClient;
    const geoSampaClient = createGeoSampaClient();
    const service = createService(client, passthrough, geoSampaClient);

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
    const service = createService(client, passthrough);

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
    const service = createService(client, passthrough);

    const response = await service.findAll('SP');

    expect(response.data.length).toBeGreaterThan(0);
    expect(response.metadata).toMatchObject({
      dataOrigin: 'fallback',
      isStale: true,
    });
    expect(passthrough.apply).toHaveBeenLastCalledWith(expect.any(Array), {
      history: false,
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
      const service = createService(client, passthrough);

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

  it('rechecks sooner when the history could not be fully loaded', async () => {
    vi.useFakeTimers();
    try {
      const fetchUnits = vi.fn().mockResolvedValue([liveUnit]);
      const client = { fetchUnits } as unknown as CnesClient;
      const incomplete = {
        apply: vi.fn((units: HealthUnit[]) =>
          Promise.resolve({ units, validated: true, historyComplete: false }),
        ),
      } as unknown as UnitLocationsService;
      const service = createService(client, incomplete);

      await service.findAll('RJ');
      vi.advanceTimersByTime(30 * 60 * 1000);
      await service.findAll('RJ');
      expect(fetchUnits).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(31 * 60 * 1000);
      await service.findAll('RJ');
      expect(fetchUnits).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an invalid state before calling CNES', async () => {
    const fetchUnits = vi.fn();
    const client = { fetchUnits } as unknown as CnesClient;
    const service = createService(client, passthrough);

    await expect(service.findAll('XX')).rejects.toThrow(
      'Invalid Brazilian state abbreviation',
    );
    expect(fetchUnits).not.toHaveBeenCalled();
  });

  it('returns all country units for ALL/BR', async () => {
    const fetchUnits = vi.fn();
    const client = { fetchUnits } as unknown as CnesClient;
    const geoSampaClient = createGeoSampaClient();
    const service = createService(client, passthrough, geoSampaClient);

    const response = await service.findAll('ALL');
    expect(response.data.length).toBeGreaterThan(1000);
    expect(response.metadata.state).toBe('BR');
    expect(response.metadata.dataOrigin).toBe('fallback');
    expect(fetchUnits).not.toHaveBeenCalled();
    expect(geoSampaClient.enrichLocations).not.toHaveBeenCalled();
  });

  it('keeps validated locations when GeoSampa is unavailable', async () => {
    const client = {
      fetchUnits: vi.fn().mockResolvedValue([liveUnit]),
    } as unknown as CnesClient;
    const geoSampaClient = {
      enrichLocations: vi.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as GeoSampaClient;
    const service = createService(client, passthrough, geoSampaClient);

    const response = await service.findAll('SP');

    expect(response.data).toEqual([liveUnit]);
    expect(response.metadata.dataOrigin).toBe('live');
  });

  describe('invalidate', () => {
    const deferredFetch = () => {
      const resolvers: ((units: HealthUnit[]) => void)[] = [];
      const fetchUnits = vi.fn().mockImplementation(
        () =>
          new Promise<HealthUnit[]>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      return { fetchUnits, resolvers };
    };

    it('drops the cached response, so the next request loads again', async () => {
      const fetchUnits = vi.fn().mockResolvedValue([liveUnit]);
      const service = createService(
        { fetchUnits } as unknown as CnesClient,
        passthrough,
      );

      await service.findAll('SP');
      service.invalidate();
      await service.findAll('SP');

      expect(fetchUnits).toHaveBeenCalledTimes(2);
    });

    it('keeps a load started before it from refilling the cache with outdated data', async () => {
      const { fetchUnits, resolvers } = deferredFetch();
      const service = createService(
        { fetchUnits } as unknown as CnesClient,
        passthrough,
      );

      const stale = service.findAll('SP');
      service.invalidate();
      resolvers[0]!([liveUnit]);
      await stale;

      const fresh = service.findAll('SP');
      resolvers[1]!([liveUnit]);
      await fresh;

      expect(fetchUnits).toHaveBeenCalledTimes(2);
    });

    it('does not let a request after it join a load that started before it', async () => {
      const { fetchUnits, resolvers } = deferredFetch();
      const service = createService(
        { fetchUnits } as unknown as CnesClient,
        passthrough,
      );

      const before = service.findAll('SP');
      service.invalidate();
      const after = service.findAll('SP');
      resolvers[0]!([liveUnit]);
      resolvers[1]!([liveUnit]);

      expect(await after).not.toBe(await before);
      expect(fetchUnits).toHaveBeenCalledTimes(2);
    });

    it('does not keep serving a removed position when CNES fails right after', async () => {
      const fetchUnits = vi
        .fn()
        .mockResolvedValueOnce([liveUnit])
        .mockRejectedValueOnce(new Error('unavailable'));
      const service = createService(
        { fetchUnits } as unknown as CnesClient,
        passthrough,
      );
      await service.findAll('SP');

      service.invalidate('SP');
      const afterFailure = await service.findAll('SP');

      // The embedded snapshot goes through the current corrections; the last
      // live response would still carry the position that was just removed.
      expect(afterFailure.metadata.dataOrigin).toBe('fallback');
    });

    it('leaves the other states cached, since refetching one takes tens of seconds', async () => {
      const fetchUnits = vi.fn().mockResolvedValue([liveUnit]);
      const service = createService(
        { fetchUnits } as unknown as CnesClient,
        passthrough,
      );
      await service.findAll('SP');
      await service.findAll('RJ');

      service.invalidate('SP');
      await service.findAll('RJ');
      await service.findAll('SP');

      // RJ came from the cache; SP was loaded again.
      expect(fetchUnits).toHaveBeenCalledTimes(3);
    });

    it('still caches a slow load of another state that finishes after the write', async () => {
      const resolvers: ((units: HealthUnit[]) => void)[] = [];
      const fetchUnits = vi.fn().mockImplementation(
        () =>
          new Promise<HealthUnit[]>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const service = createService(
        { fetchUnits } as unknown as CnesClient,
        passthrough,
      );

      const slow = service.findAll('SP');
      // A correction is saved for a unit in another state meanwhile.
      service.invalidate('RJ');
      resolvers[0]!([liveUnit]);
      await slow;
      await service.findAll('SP');

      // The SP load was not thrown away, so it did not have to be repeated.
      expect(fetchUnits).toHaveBeenCalledTimes(1);
    });

    it('still discards a load of the same state that started before the write', async () => {
      const resolvers: ((units: HealthUnit[]) => void)[] = [];
      const fetchUnits = vi.fn().mockImplementation(
        () =>
          new Promise<HealthUnit[]>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const service = createService(
        { fetchUnits } as unknown as CnesClient,
        passthrough,
      );

      const stale = service.findAll('SP');
      service.invalidate('SP');
      resolvers[0]!([liveUnit]);
      await stale;
      const fresh = service.findAll('SP');
      resolvers[1]!([liveUnit]);
      await fresh;

      expect(fetchUnits).toHaveBeenCalledTimes(2);
    });

    it('drops the national view along with the state', async () => {
      const apply = vi.fn((units: HealthUnit[]) =>
        Promise.resolve({ units, validated: true, historyComplete: true }),
      );
      const service = createService(
        { fetchUnits: vi.fn() } as unknown as CnesClient,
        {
          apply,
        } as unknown as UnitLocationsService,
      );
      await service.findAll('BR');

      service.invalidate('SP');
      await service.findAll('BR');

      expect(apply).toHaveBeenCalledTimes(2);
    });

    it('also drops the national response', async () => {
      const apply = vi.fn((units: HealthUnit[]) =>
        Promise.resolve({ units, validated: true, historyComplete: true }),
      );
      const service = createService(
        { fetchUnits: vi.fn() } as unknown as CnesClient,
        {
          apply,
        } as unknown as UnitLocationsService,
      );

      await service.findAll('BR');
      service.invalidate();
      await service.findAll('BR');

      expect(apply).toHaveBeenCalledTimes(2);
    });
  });

  describe('national snapshot', () => {
    const noClient = { fetchUnits: vi.fn() } as unknown as CnesClient;

    it('checks the position of the snapshot units against their municipality', async () => {
      const apply = vi.fn((units: HealthUnit[]) =>
        Promise.resolve({
          units: units.map((unit, index) =>
            index === 0
              ? {
                  ...unit,
                  location: {
                    ...unit.location,
                    precision: 'municipality' as const,
                  },
                }
              : unit,
          ),
          validated: true,
          historyComplete: true,
        }),
      );
      const service = createService(noClient, {
        apply,
      } as unknown as UnitLocationsService);

      const response = await service.findAll('BR');

      // History stays enabled: the CNES host is not known to be down here.
      expect(apply).toHaveBeenCalledWith(expect.any(Array));
      expect(apply.mock.calls[0]).toHaveLength(1);
      expect(response.data[0]!.location.precision).toBe('municipality');
      expect(response.metadata.dataOrigin).toBe('fallback');
    });

    it('gives every snapshot unit the code of its municipality', async () => {
      const apply = vi.fn((units: HealthUnit[]) =>
        Promise.resolve({ units, validated: true, historyComplete: true }),
      );
      const service = createService(noClient, {
        apply,
      } as unknown as UnitLocationsService);

      const { data } = await service.findAll('BR');

      expect(data.length).toBeGreaterThan(1000);
      expect(
        data.filter((unit) => !/^\d{6}$/.test(unit.address.municipalityCode)),
      ).toEqual([]);
    });

    it('shares one check between concurrent requests', async () => {
      const apply = vi.fn((units: HealthUnit[]) =>
        Promise.resolve({ units, validated: true, historyComplete: true }),
      );
      const service = createService(noClient, {
        apply,
      } as unknown as UnitLocationsService);

      const [first, second] = await Promise.all([
        service.findAll('BR'),
        service.findAll('ALL'),
      ]);

      expect(second).toBe(first);
      expect(apply).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['everything loaded', true, true, 6 * 60],
      ['the history could not be fully loaded', true, false, 60],
      ['the municipality boundaries are unavailable', false, true, 5],
    ])(
      'rechecks at the right time when %s',
      async (_label, validated, historyComplete, minutes) => {
        vi.useFakeTimers();
        try {
          const apply = vi.fn((units: HealthUnit[]) =>
            Promise.resolve({ units, validated, historyComplete }),
          );
          const service = createService(noClient, {
            apply,
          } as unknown as UnitLocationsService);

          await service.findAll('BR');
          vi.advanceTimersByTime((minutes - 1) * 60 * 1000);
          await service.findAll('BR');
          expect(apply).toHaveBeenCalledTimes(1);

          vi.advanceTimersByTime(2 * 60 * 1000);
          await service.findAll('BR');
          expect(apply).toHaveBeenCalledTimes(2);
        } finally {
          vi.useRealTimers();
        }
      },
    );
  });
});
