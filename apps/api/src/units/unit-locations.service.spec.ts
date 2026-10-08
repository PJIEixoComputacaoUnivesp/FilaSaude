import { Logger } from '@nestjs/common';
import type { UnitLocationCorrectionEntity } from '../database/entities/unit-location-correction.entity.js';
import type { UnitLocationCorrectionRepository } from '../database/repositories/unit-location-correction.repository.js';
import type {
  CnesHistoryClient,
  CnesHistoryEntry,
} from './cnes-history.client.js';
import { distanceToAreaKm, type Polygon } from './geometry.js';
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

function unit(
  latitude: number | null,
  longitude: number | null,
  address: Partial<HealthUnit['address']> = {},
): HealthUnit {
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
      ...address,
    },
    location: {
      latitude,
      longitude,
      precision: 'source',
      original: null,
      referenceMonth: null,
      correctedAt: null,
    },
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
  };
}

function release(
  referenceMonth: string,
  latitude: number | null,
  longitude: number | null,
  overrides: Partial<CnesHistoryEntry> = {},
): CnesHistoryEntry {
  return {
    referenceMonth,
    latitude,
    longitude,
    street: 'Rua Teste',
    number: '100',
    ...overrides,
  };
}

const noHistory = () => Promise.resolve<CnesHistoryEntry[]>([]);

const noCorrections = () => Promise.resolve<UnitLocationCorrectionEntity[]>([]);

function serviceWith(
  fetch: ReturnType<typeof vi.fn>,
  history: ReturnType<typeof vi.fn> = vi.fn(noHistory),
  findCorrections: ReturnType<typeof vi.fn> = vi.fn(noCorrections),
) {
  return new UnitLocationsService(
    { fetch } as unknown as MunicipalityBoundariesClient,
    { fetch: history } as unknown as CnesHistoryClient,
    { findAll: findCorrections } as unknown as UnitLocationCorrectionRepository,
  );
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
      referenceMonth: null,
      correctedAt: null,
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
    const { latitude, longitude, precision } = units[0]!.location;

    expect(precision).toBe('municipality');
    expect(
      distanceToAreaKm([lShape], {
        latitude: latitude!,
        longitude: longitude!,
      }),
    ).toBe(0);
  });

  it('keeps units untouched when the boundaries are unavailable', async () => {
    const input = unit(-24.9, -46.9);
    const { units, validated } = await serviceWith(
      vi.fn().mockRejectedValue(new Error('offline')),
    ).apply([input]);

    expect(validated).toBe(false);
    expect(units).toEqual([input]);
  });

  it('still checks the states whose boundaries loaded when another one fails', async () => {
    const fetch = vi.fn((state: string) =>
      state === 'RJ' ? Promise.reject(new Error('offline')) : boundaries(),
    );
    const inSp = unit(-24.9, -46.9);
    const inRj = {
      ...unit(-24.9, -46.9, { state: 'RJ', municipalityCode: '330000' }),
      id: '0000002',
    };
    const { units, validated } = await serviceWith(fetch).apply([inSp, inRj]);

    expect(validated).toBe(false);
    expect(units[0]!.location.precision).toBe('municipality');
    expect(units[1]).toBe(inRj);
  });

  it('reports the units without a boundary in a single warning', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      const inputs = ['0000001', '0000002'].map((id) => ({
        ...unit(-24.9, -46.9, { municipalityCode: '510183' }),
        id,
      }));
      await serviceWith(vi.fn(boundaries)).apply(inputs);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /2 unit\(s\) in municipality 510183.*0000001, 0000002/,
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps a unit untouched when its municipality has no boundary yet', async () => {
    // A municipality newer than the IBGE boundaries, like Boa Esperança do Norte.
    const input = unit(-24.9, -46.9, { municipalityCode: '510183' });
    const history = vi.fn(noHistory);
    const { units } = await serviceWith(vi.fn(boundaries), history).apply([
      input,
    ]);

    expect(units[0]).toBe(input);
    expect(history).not.toHaveBeenCalled();
  });

  it('caches boundaries by state', async () => {
    const fetch = vi.fn(boundaries);
    const service = serviceWith(fetch);

    await service.apply([unit(-23.9, -46.9)]);
    await service.apply([unit(-23.9, -46.9)]);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe('CNES history', () => {
    const misplaced = () =>
      unit(-24.9, -46.9, { street: 'Rua Teste', number: '100' });
    const withHistory = (entries: CnesHistoryEntry[]) =>
      serviceWith(
        vi.fn(boundaries),
        vi.fn(() => Promise.resolve(entries)),
      );

    it('uses the latest earlier coordinate registered for the same address', async () => {
      // Like the UPA Bruno Covas, whose point broke in a later release.
      const { units, validated, historyComplete } = await withHistory([
        release('2025-06', -23.85, -46.85),
        release('2025-11', -23.9, -46.9),
        release('2025-12', -24.9, -46.9),
      ]).apply([misplaced()]);

      expect(validated).toBe(true);
      expect(historyComplete).toBe(true);
      expect(units[0]!.location).toEqual({
        latitude: -23.9,
        longitude: -46.9,
        precision: 'history',
        original: { latitude: -24.9, longitude: -46.9 },
        referenceMonth: '2025-11',
        correctedAt: null,
      });
    });

    it('skips releases outside the municipality or without a coordinate', async () => {
      const { units } = await withHistory([
        release('2026-01', -24.9, -46.9),
        release('2025-12', null, null),
        release('2025-06', -23.85, -46.85),
      ]).apply([misplaced()]);

      expect(units[0]!.location).toMatchObject({
        precision: 'history',
        referenceMonth: '2025-06',
      });
    });

    it('accepts an earlier point just inside the border tolerance', async () => {
      // About 2.2 km west of the square.
      const { units } = await withHistory([
        release('2025-06', -23.9, -47.02),
      ]).apply([misplaced()]);

      expect(units[0]!.location.precision).toBe('history');
    });

    it('does not trust a release registered for another address', async () => {
      const { units } = await withHistory([
        release('2026-01', -23.9, -46.9, { street: 'Avenida Outra' }),
        release('2025-12', -23.9, -46.9, { number: '7' }),
        release('2025-06', -23.85, -46.85),
      ]).apply([misplaced()]);

      expect(units[0]!.location).toMatchObject({
        precision: 'history',
        referenceMonth: '2025-06',
      });
    });

    it('compares the street and number ignoring accents, case and leading zeros', async () => {
      const { units } = await withHistory([
        release('2025-06', -23.85, -46.85, {
          street: 'RUA JOAO',
          number: '01',
        }),
      ]).apply([
        unit(-24.9, -46.9, {
          street: 'Rua João',
          number: '1',
          postalCode: '12345000',
        }),
      ]);

      expect(units[0]!.location.precision).toBe('history');
    });

    it('falls back to the municipality center when no release qualifies', async () => {
      const { units, validated } = await withHistory([
        release('2025-06', -23.85, -46.85, { street: 'Avenida Outra' }),
      ]).apply([misplaced()]);

      expect(validated).toBe(true);
      expect(units[0]!.location).toMatchObject({
        precision: 'municipality',
        referenceMonth: null,
        correctedAt: null,
        original: { latitude: -24.9, longitude: -46.9 },
      });
    });

    it('also recovers a unit that has no coordinate now', async () => {
      const { units } = await withHistory([
        release('2025-06', -23.85, -46.85),
      ]).apply([unit(null, null, { street: 'Rua Teste', number: '100' })]);

      expect(units[0]!.location).toMatchObject({
        precision: 'history',
        original: null,
      });
    });

    it('does not look up the history of units that keep their coordinate', async () => {
      const history = vi.fn(noHistory);
      const { units } = await serviceWith(vi.fn(boundaries), history).apply([
        unit(-23.9, -46.9),
      ]);

      expect(units[0]!.location.precision).toBe('source');
      expect(history).not.toHaveBeenCalled();
    });

    it('queries the history by the unit code alone', async () => {
      const history = vi.fn(noHistory);
      await serviceWith(vi.fn(boundaries), history).apply([misplaced()]);

      // No signal: the fetch is shared, so it cannot follow one caller's deadline.
      expect(history).toHaveBeenCalledWith('5563704');
    });

    it("does not let one caller's deadline fail another waiting on the same history", async () => {
      const deadlines = [new AbortController(), new AbortController()];
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValueOnce(deadlines[0]!.signal)
        .mockReturnValueOnce(deadlines[1]!.signal);
      try {
        let resolveHistory: (entries: CnesHistoryEntry[]) => void = () =>
          undefined;
        // Like the real client, the fetch fails when a signal it was given aborts.
        const history = vi.fn(
          (_id: string, signal?: AbortSignal) =>
            new Promise<CnesHistoryEntry[]>((resolve, reject) => {
              resolveHistory = resolve;
              signal?.addEventListener('abort', () => reject(signal.reason), {
                once: true,
              });
            }),
        );
        const service = serviceWith(vi.fn(boundaries), history);

        const first = service.apply([misplaced()]);
        const second = service.apply([misplaced()]);
        await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(1));

        deadlines[0]!.abort(new Error('deadline'));
        const gaveUp = await first;
        resolveHistory([release('2025-06', -23.85, -46.85)]);
        const completed = await second;

        expect(gaveUp.historyComplete).toBe(false);
        expect(gaveUp.units[0]!.location.precision).toBe('municipality');
        expect(completed.historyComplete).toBe(true);
        expect(completed.units[0]!.location.precision).toBe('history');
        expect(history).toHaveBeenCalledTimes(1);
      } finally {
        timeout.mockRestore();
      }
    });

    it('falls back to the municipality center and reports it when the history fails', async () => {
      const { units, validated, historyComplete } = await serviceWith(
        vi.fn(boundaries),
        vi.fn().mockRejectedValue(new Error('offline')),
      ).apply([misplaced()]);

      expect(validated).toBe(true);
      expect(historyComplete).toBe(false);
      expect(units[0]!.location.precision).toBe('municipality');
    });

    it('keeps the units whose history loaded when another one fails', async () => {
      const history = vi.fn((id: string) =>
        id === '0000002'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve([release('2025-06', -23.85, -46.85)]),
      );
      const { units, historyComplete } = await serviceWith(
        vi.fn(boundaries),
        history,
      ).apply([
        { ...misplaced(), id: '0000001' },
        { ...misplaced(), id: '0000002' },
      ]);

      expect(historyComplete).toBe(false);
      expect(units.map(({ location }) => location.precision)).toEqual([
        'history',
        'municipality',
      ]);
    });

    it('skips the history when asked to', async () => {
      const history = vi.fn(noHistory);
      const { units, validated } = await serviceWith(
        vi.fn(boundaries),
        history,
      ).apply([misplaced()], { history: false });

      expect(history).not.toHaveBeenCalled();
      expect(validated).toBe(true);
      expect(units[0]!.location.precision).toBe('municipality');
    });

    it('caches the releases of a unit between loads', async () => {
      const history = vi.fn(() =>
        Promise.resolve([release('2025-06', -23.85, -46.85)]),
      );
      const service = serviceWith(vi.fn(boundaries), history);

      await service.apply([misplaced()]);
      const { units } = await service.apply([misplaced()]);

      expect(history).toHaveBeenCalledTimes(1);
      expect(units[0]!.location.precision).toBe('history');
    });

    it('applies the cached releases to a changed address', async () => {
      const service = withHistory([release('2025-06', -23.85, -46.85)]);

      await service.apply([misplaced()]);
      const { units } = await service.apply([
        unit(-24.9, -46.9, { street: 'Rua Nova', number: '5' }),
      ]);

      expect(units[0]!.location.precision).toBe('municipality');
    });
  });
  describe('manual corrections', () => {
    const correction = (
      overrides: Partial<UnitLocationCorrectionEntity> = {},
    ): UnitLocationCorrectionEntity =>
      ({
        cnesCode: '5563704',
        latitude: -23.85,
        longitude: -46.85,
        verifiedBy: 'Maria Souza',
        method: 'Conferido no mapa oficial da prefeitura',
        correctedAt: new Date('2026-10-07T15:00:00Z'),
        anchorMunicipalityCode: '350000',
        anchorStreet: 'Rua Teste',
        anchorNumber: '100',
        anchorLatitude: -24.9,
        anchorLongitude: -46.9,
        ...overrides,
      }) as UnitLocationCorrectionEntity;
    const withCorrections = (
      rows: UnitLocationCorrectionEntity[],
      history = vi.fn(noHistory),
    ) =>
      serviceWith(
        vi.fn(boundaries),
        history,
        vi.fn(() => Promise.resolve(rows)),
      );
    const misplaced = () =>
      unit(-24.9, -46.9, { street: 'Rua Teste', number: '100' });

    it('puts the manual position over a misplaced CNES coordinate', async () => {
      const history = vi.fn(noHistory);
      const { units, validated } = await withCorrections(
        [correction()],
        history,
      ).apply([misplaced()]);

      expect(validated).toBe(true);
      expect(units[0]!.location).toEqual({
        latitude: -23.85,
        longitude: -46.85,
        precision: 'manual',
        original: { latitude: -24.9, longitude: -46.9 },
        referenceMonth: null,
        correctedAt: '2026-10-07',
      });
      expect(history).not.toHaveBeenCalled();
    });

    it('also overrides a CNES coordinate that is inside the municipality', async () => {
      const { units } = await withCorrections([
        correction({ anchorLatitude: -23.9, anchorLongitude: -46.9 }),
      ]).apply([unit(-23.9, -46.9, { street: 'Rua Teste', number: '100' })]);

      expect(units[0]!.location).toMatchObject({
        precision: 'manual',
        latitude: -23.85,
      });
    });

    it('does not expose who verified the position or how', async () => {
      const { units } = await withCorrections([correction()]).apply([
        misplaced(),
      ]);

      const json = JSON.stringify(units[0]);
      expect(json).not.toContain('Maria Souza');
      expect(json).not.toContain('Conferido no mapa');
      expect(Object.keys(units[0]!.location).sort()).toEqual([
        'correctedAt',
        'latitude',
        'longitude',
        'original',
        'precision',
        'referenceMonth',
      ]);
    });

    it('dates the correction in the Brazilian calendar day', async () => {
      // 01:30 UTC is still the previous evening in Brasília.
      const { units } = await withCorrections([
        correction({ correctedAt: new Date('2026-10-08T01:30:00Z') }),
      ]).apply([misplaced()]);

      expect(units[0]!.location.correctedAt).toBe('2026-10-07');
    });

    it('ignores the corrections of other units', async () => {
      const { units } = await withCorrections([
        correction({ cnesCode: '7654321' }),
      ]).apply([misplaced()]);

      expect(units[0]!.location.precision).toBe('municipality');
    });

    it('leaves the correction out when the address changed in CNES', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        const { units } = await withCorrections([
          correction({ anchorStreet: 'Rua Antiga' }),
        ]).apply([misplaced()]);

        expect(units[0]!.location.precision).toBe('municipality');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('5563704'));
      } finally {
        warn.mockRestore();
      }
    });

    it('leaves the correction out when the municipality changed in CNES', async () => {
      const { units } = await withCorrections([
        correction({ anchorMunicipalityCode: '350001' }),
      ]).apply([misplaced()]);

      expect(units[0]!.location.precision).toBe('municipality');
    });

    it('keeps a correction for a unit whose street is missing on both sides', async () => {
      const { units } = await withCorrections([
        correction({ anchorStreet: null, anchorNumber: null }),
      ]).apply([unit(-24.9, -46.9)]);

      expect(units[0]!.location.precision).toBe('manual');
    });

    it('applies to a municipality that has no boundary yet', async () => {
      const { units } = await withCorrections([
        correction({ anchorMunicipalityCode: '510183' }),
      ]).apply([
        unit(-24.9, -46.9, {
          municipalityCode: '510183',
          street: 'Rua Teste',
          number: '100',
        }),
      ]);

      expect(units[0]!.location.precision).toBe('manual');
    });

    it('compares a long CNES address as it was stored, cut to the column length', async () => {
      const street = 'R'.repeat(400);
      const number = '9'.repeat(60);

      const { units } = await withCorrections([
        correction({
          anchorStreet: street.slice(0, 255),
          anchorNumber: number.slice(0, 32),
        }),
      ]).apply([unit(-24.9, -46.9, { street, number })]);

      expect(units[0]!.location.precision).toBe('manual');
    });

    it('does not report a change when only the CNES rounding differs', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      try {
        // CNES carries 7 decimals and the anchor 6.
        await withCorrections([
          correction({ anchorLatitude: -24.52124, anchorLongitude: -45.83955 }),
        ]).apply([
          unit(-24.5212404, -45.8395502, {
            street: 'Rua Teste',
            number: '100',
          }),
        ]);

        expect(log).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    });

    it('reports it, and still applies, when CNES changed the coordinate', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      try {
        const { units } = await withCorrections([correction()]).apply([
          unit(-23.9, -46.9, { street: 'Rua Teste', number: '100' }),
        ]);

        expect(units[0]!.location.precision).toBe('manual');
        expect(log).toHaveBeenCalledWith(expect.stringContaining('5563704'));
      } finally {
        log.mockRestore();
      }
    });

    it('skips the layer and rechecks soon when the corrections cannot be read', async () => {
      const { units, validated } = await serviceWith(
        vi.fn(boundaries),
        vi.fn(noHistory),
        vi.fn().mockRejectedValue(new Error('database is down')),
      ).apply([misplaced()]);

      expect(validated).toBe(false);
      expect(units[0]!.location.precision).toBe('municipality');
    });
  });
});
