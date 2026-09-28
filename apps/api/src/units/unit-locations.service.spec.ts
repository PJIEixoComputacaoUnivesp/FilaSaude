import type { Polygon } from './geometry.js';
import type { MunicipalityBoundariesClient } from './municipality-boundaries.client.js';
import { UnitLocationsService } from './unit-locations.service.js';
import type { HealthUnit } from './units.types.js';

// A square of about 22 km per side, from (-47, -24) to (-46.8, -23.8).
const square: Polygon = [
  [
    [-47, -24],
    [-46.8, -24],
    [-46.8, -23.8],
    [-47, -23.8],
    [-47, -24],
  ],
];

function unit(latitude: number | null, longitude: number | null): HealthUnit {
  return {
    id: '5563704',
    name: 'UPA Teste',
    unitType: 'PRONTO ATENDIMENTO',
    address: {
      street: null,
      number: null,
      district: null,
      postalCode: null,
      municipalityCode: '350000',
      city: 'Cidade',
      state: 'SP',
    },
    location: { latitude, longitude, precision: 'source', original: null },
    serviceHours: null,
    lastUpdatedAt: '2026-09-20',
  };
}

function serviceWith(fetch: ReturnType<typeof vi.fn>) {
  return new UnitLocationsService({
    fetch,
  } as unknown as MunicipalityBoundariesClient);
}

const boundaries = () => Promise.resolve(new Map([['350000', [square]]]));

describe('UnitLocationsService', () => {
  it('keeps a coordinate inside the municipality', async () => {
    const input = unit(-23.9, -46.9);
    const { units, validated } = await serviceWith(vi.fn(boundaries)).apply([
      input,
    ]);

    expect(validated).toBe(true);
    expect(units[0]).toBe(input);
  });

  it('keeps a coordinate outside the border but within the tolerance', async () => {
    // About 2.2 km west of the square.
    const input = unit(-23.9, -47.02);
    const { units } = await serviceWith(vi.fn(boundaries)).apply([input]);

    expect(units[0]).toBe(input);
  });

  it('moves a coordinate beyond the tolerance to the municipality center', async () => {
    // One degree south, like the UPA Bruno Covas record.
    const { units } = await serviceWith(vi.fn(boundaries)).apply([
      unit(-24.9, -46.9),
    ]);

    expect(units).toHaveLength(1);
    expect(units[0]!.location).toEqual({
      latitude: expect.closeTo(-23.9, 3),
      longitude: expect.closeTo(-46.9, 3),
      precision: 'municipality',
      original: { latitude: -24.9, longitude: -46.9 },
    });
  });

  it('places a unit without coordinates at the municipality center', async () => {
    const { units } = await serviceWith(vi.fn(boundaries)).apply([
      unit(null, null),
    ]);

    expect(units[0]!.location).toMatchObject({
      precision: 'municipality',
      original: null,
    });
    expect(units[0]!.location.latitude).not.toBeNull();
  });

  it('uses a point inside a concave municipality', async () => {
    // An L shape whose centroid falls in the empty corner.
    const lShape: Polygon = [
      [
        [0, 0],
        [10, 0],
        [10, 1],
        [1, 1],
        [1, 10],
        [0, 10],
        [0, 0],
      ],
    ];
    const service = serviceWith(
      vi.fn(() => Promise.resolve(new Map([['350000', [lShape]]]))),
    );
    const { units } = await service.apply([unit(50, 50)]);
    const { latitude, longitude } = units[0]!.location;

    const inArm =
      (latitude! <= 1 && longitude! >= 0) ||
      (longitude! <= 1 && latitude! >= 0);
    expect(inArm).toBe(true);
  });

  it('keeps units untouched when the boundaries are unavailable', async () => {
    const input = unit(-24.9, -46.9);
    const { units, validated } = await serviceWith(
      vi.fn().mockRejectedValue(new Error('offline')),
    ).apply([input]);

    expect(validated).toBe(false);
    expect(units).toEqual([input]);
  });

  it('caches boundaries by state', async () => {
    const fetch = vi.fn(boundaries);
    const service = serviceWith(fetch);

    await service.apply([unit(-23.9, -46.9)]);
    await service.apply([unit(-23.9, -46.9)]);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
