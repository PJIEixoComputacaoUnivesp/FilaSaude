import { HealthUnitEntity } from '../database/entities/health-unit.entity.js';
import type { HealthUnitRepository } from '../database/repositories/health-unit.repository.js';
import { GeoSampaClient } from './geosampa.client.js';
import { brazilianStates } from './states.js';
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

const storedEntity = Object.assign(new HealthUnitEntity(), {
  cnesCode: liveUnit.id,
  name: liveUnit.name,
  unitType: liveUnit.unitType,
  street: liveUnit.address.street,
  number: liveUnit.address.number,
  district: liveUnit.address.district,
  postalCode: liveUnit.address.postalCode,
  municipalityCode: liveUnit.address.municipalityCode,
  city: liveUnit.address.city,
  state: liveUnit.address.state,
  latitude: liveUnit.location.latitude,
  longitude: liveUnit.location.longitude,
  serviceHours: liveUnit.serviceHours,
  sourceName: liveUnit.sources[0]!.name,
  sourceUrl: liveUnit.sources[0]!.url,
  sourceUpdatedAt: liveUnit.lastUpdatedAt,
  ingestedAt: new Date('2026-09-21T12:00:00Z'),
  isActive: true,
});

const nationalStoredEntities = brazilianStates().map(
  ({ abbreviation }, index) =>
    Object.assign(new HealthUnitEntity(), storedEntity, {
      cnesCode: String(index).padStart(7, '0'),
      state: abbreviation,
    }),
);

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
  repository: HealthUnitRepository,
  locations: UnitLocationsService,
  geoSampaClient = createGeoSampaClient(),
) {
  return new UnitsService(repository, locations, geoSampaClient);
}

describe('UnitsService', () => {
  it('returns and caches live CNES data', async () => {
    const findActive = vi.fn().mockResolvedValue([storedEntity]);
    const repository = { findActive } as unknown as HealthUnitRepository;
    const geoSampaClient = createGeoSampaClient();
    const service = createService(repository, passthrough, geoSampaClient);

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
    expect(findActive).toHaveBeenCalledTimes(1);
    expect(geoSampaClient.enrichLocations).toHaveBeenCalledWith([liveUnit]);
  });

  it('shares an in-flight CNES request for the same state', async () => {
    let resolveFetch: ((units: HealthUnitEntity[]) => void) | undefined;
    const findActive = vi.fn().mockImplementation(
      () =>
        new Promise<HealthUnitEntity[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const repository = { findActive } as unknown as HealthUnitRepository;
    const service = createService(repository, passthrough);

    const first = service.findAll('SP');
    const second = service.findAll('SP');

    expect(findActive).toHaveBeenCalledTimes(1);
    resolveFetch?.([storedEntity]);
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(secondResponse).toBe(firstResponse);
  });

  it('returns the snapshot when CNES is unavailable', async () => {
    const repository = {
      findActive: vi.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as HealthUnitRepository;
    const service = createService(repository, passthrough);

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
      const findActive = vi
        .fn()
        .mockResolvedValueOnce([storedEntity])
        .mockRejectedValueOnce(new Error('unavailable'));
      const repository = { findActive } as unknown as HealthUnitRepository;
      const service = createService(repository, passthrough);

      const live = await service.findAll('RJ');
      vi.advanceTimersByTime(7 * 60 * 60 * 1000);
      const stale = await service.findAll('RJ');

      expect(stale.data).toEqual([liveUnit]);
      expect(stale.metadata).toMatchObject({
        dataOrigin: 'live',
        isStale: true,
        retrievedAt: live.metadata.retrievedAt,
      });
      expect(findActive).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rechecks sooner when the history could not be fully loaded', async () => {
    vi.useFakeTimers();
    try {
      const findActive = vi.fn().mockResolvedValue([storedEntity]);
      const repository = { findActive } as unknown as HealthUnitRepository;
      const incomplete = {
        apply: vi.fn((units: HealthUnit[]) =>
          Promise.resolve({ units, validated: true, historyComplete: false }),
        ),
      } as unknown as UnitLocationsService;
      const service = createService(repository, incomplete);

      await service.findAll('RJ');
      vi.advanceTimersByTime(30 * 60 * 1000);
      await service.findAll('RJ');
      expect(findActive).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(31 * 60 * 1000);
      await service.findAll('RJ');
      expect(findActive).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an invalid state before calling CNES', async () => {
    const findActive = vi.fn();
    const repository = { findActive } as unknown as HealthUnitRepository;
    const service = createService(repository, passthrough);

    await expect(service.findAll('XX')).rejects.toThrow(
      'Invalid Brazilian state abbreviation',
    );
    expect(findActive).not.toHaveBeenCalled();
  });

  it('returns all country units for ALL/BR', async () => {
    const findActive = vi.fn().mockResolvedValue(nationalStoredEntities);
    const repository = { findActive } as unknown as HealthUnitRepository;
    const geoSampaClient = createGeoSampaClient();
    const service = createService(repository, passthrough, geoSampaClient);

    const response = await service.findAll('ALL');
    expect(response.data).toHaveLength(nationalStoredEntities.length);
    expect(response.metadata.state).toBe('BR');
    expect(response.metadata.dataOrigin).toBe('live');
    expect(findActive).toHaveBeenCalledWith(undefined);
    expect(geoSampaClient.enrichLocations).not.toHaveBeenCalled();
  });

  it('uses the fallback snapshot when the stored national catalog is partial', async () => {
    const findActive = vi.fn().mockResolvedValue([storedEntity]);
    const repository = { findActive } as unknown as HealthUnitRepository;
    const service = createService(repository, passthrough);

    const response = await service.findAll('BR');

    expect(response.data.length).toBeGreaterThan(1_000);
    expect(response.metadata).toMatchObject({
      state: 'BR',
      dataOrigin: 'fallback',
      isStale: true,
    });
  });

  it('keeps validated locations when GeoSampa is unavailable', async () => {
    const repository = {
      findActive: vi.fn().mockResolvedValue([storedEntity]),
    } as unknown as HealthUnitRepository;
    const geoSampaClient = {
      enrichLocations: vi.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as GeoSampaClient;
    const service = createService(repository, passthrough, geoSampaClient);

    const response = await service.findAll('SP');

    expect(response.data).toEqual([liveUnit]);
    expect(response.metadata.dataOrigin).toBe('live');
  });

  describe('invalidate', () => {
    const deferredFetch = () => {
      const resolvers: ((units: HealthUnitEntity[]) => void)[] = [];
      const findActive = vi.fn().mockImplementation(
        () =>
          new Promise<HealthUnitEntity[]>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      return { findActive, resolvers };
    };

    it('drops the cached response, so the next request loads again', async () => {
      const findActive = vi.fn().mockResolvedValue([storedEntity]);
      const service = createService(
        { findActive } as unknown as HealthUnitRepository,
        passthrough,
      );

      await service.findAll('SP');
      service.invalidate();
      await service.findAll('SP');

      expect(findActive).toHaveBeenCalledTimes(2);
    });

    it('keeps a load started before it from refilling the cache with outdated data', async () => {
      const { findActive, resolvers } = deferredFetch();
      const service = createService(
        { findActive } as unknown as HealthUnitRepository,
        passthrough,
      );

      const stale = service.findAll('SP');
      service.invalidate();
      resolvers[0]!([storedEntity]);
      await stale;

      const fresh = service.findAll('SP');
      resolvers[1]!([storedEntity]);
      await fresh;

      expect(findActive).toHaveBeenCalledTimes(2);
    });

    it('does not let a request after it join a load that started before it', async () => {
      const { findActive, resolvers } = deferredFetch();
      const service = createService(
        { findActive } as unknown as HealthUnitRepository,
        passthrough,
      );

      const before = service.findAll('SP');
      service.invalidate();
      const after = service.findAll('SP');
      resolvers[0]!([storedEntity]);
      resolvers[1]!([storedEntity]);

      expect(await after).not.toBe(await before);
      expect(findActive).toHaveBeenCalledTimes(2);
    });

    it('does not keep serving a removed position when CNES fails right after', async () => {
      const findActive = vi
        .fn()
        .mockResolvedValueOnce([storedEntity])
        .mockRejectedValueOnce(new Error('unavailable'));
      const service = createService(
        { findActive } as unknown as HealthUnitRepository,
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
      const findActive = vi.fn().mockResolvedValue([storedEntity]);
      const service = createService(
        { findActive } as unknown as HealthUnitRepository,
        passthrough,
      );
      await service.findAll('SP');
      await service.findAll('RJ');

      service.invalidate('SP');
      await service.findAll('RJ');
      await service.findAll('SP');

      // RJ came from the cache; SP was loaded again.
      expect(findActive).toHaveBeenCalledTimes(3);
    });

    it('still caches a slow load of another state that finishes after the write', async () => {
      const resolvers: ((units: HealthUnitEntity[]) => void)[] = [];
      const findActive = vi.fn().mockImplementation(
        () =>
          new Promise<HealthUnitEntity[]>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const service = createService(
        { findActive } as unknown as HealthUnitRepository,
        passthrough,
      );

      const slow = service.findAll('SP');
      // A correction is saved for a unit in another state meanwhile.
      service.invalidate('RJ');
      resolvers[0]!([storedEntity]);
      await slow;
      await service.findAll('SP');

      // The SP load was not thrown away, so it did not have to be repeated.
      expect(findActive).toHaveBeenCalledTimes(1);
    });

    it('still discards a load of the same state that started before the write', async () => {
      const resolvers: ((units: HealthUnitEntity[]) => void)[] = [];
      const findActive = vi.fn().mockImplementation(
        () =>
          new Promise<HealthUnitEntity[]>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const service = createService(
        { findActive } as unknown as HealthUnitRepository,
        passthrough,
      );

      const stale = service.findAll('SP');
      service.invalidate('SP');
      resolvers[0]!([storedEntity]);
      await stale;
      const fresh = service.findAll('SP');
      resolvers[1]!([storedEntity]);
      await fresh;

      expect(findActive).toHaveBeenCalledTimes(2);
    });

    it('drops the national view along with the state', async () => {
      const apply = vi.fn((units: HealthUnit[]) =>
        Promise.resolve({ units, validated: true, historyComplete: true }),
      );
      const service = createService(
        { findActive: vi.fn() } as unknown as HealthUnitRepository,
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
        { findActive: vi.fn() } as unknown as HealthUnitRepository,
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
    const noRepository = {
      findActive: vi.fn(),
    } as unknown as HealthUnitRepository;

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
      const service = createService(noRepository, {
        apply,
      } as unknown as UnitLocationsService);

      const response = await service.findAll('BR');

      // The emergency snapshot remains self-contained when the catalog table
      // is unavailable or has not received its first ingestion yet.
      expect(apply).toHaveBeenCalledWith(expect.any(Array), {
        history: false,
      });
      expect(apply.mock.calls[0]).toHaveLength(2);
      expect(response.data[0]!.location.precision).toBe('municipality');
      expect(response.metadata.dataOrigin).toBe('fallback');
    });

    it('gives every snapshot unit the code of its municipality', async () => {
      const apply = vi.fn((units: HealthUnit[]) =>
        Promise.resolve({ units, validated: true, historyComplete: true }),
      );
      const service = createService(noRepository, {
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
      const service = createService(noRepository, {
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
      ['everything loaded', true, true],
      ['the history could not be fully loaded', true, false],
      ['the municipality boundaries are unavailable', false, true],
    ])(
      'rechecks the fallback soon when %s',
      async (_label, validated, historyComplete) => {
        vi.useFakeTimers();
        try {
          const apply = vi.fn((units: HealthUnit[]) =>
            Promise.resolve({ units, validated, historyComplete }),
          );
          const service = createService(noRepository, {
            apply,
          } as unknown as UnitLocationsService);

          await service.findAll('BR');
          vi.advanceTimersByTime(4 * 60 * 1000);
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
