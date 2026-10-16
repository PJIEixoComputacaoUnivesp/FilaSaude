import { Logger } from '@nestjs/common';
import type { HealthUnitRepository } from '../database/repositories/health-unit.repository.js';
import type { CnesClient } from '../units/cnes.client.js';
import type { BrazilianState } from '../units/states.js';
import type { HealthUnit } from '../units/units.types.js';
import {
  UnitsIngestionError,
  UnitsIngestionService,
} from './units-ingestion.service.js';

const sp: BrazilianState = { abbreviation: 'SP', ibgeCode: '35' };
const rj: BrazilianState = { abbreviation: 'RJ', ibgeCode: '33' };

function unit(overrides: Partial<HealthUnit> = {}): HealthUnit {
  return {
    id: '1234567',
    name: 'UPA Teste',
    unitType: 'PRONTO ATENDIMENTO',
    address: {
      street: null,
      number: null,
      district: null,
      postalCode: null,
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
    serviceHours: null,
    lastUpdatedAt: '2026-10-14',
    sources: [
      {
        name: 'Cadastro Nacional de Estabelecimentos de Saúde (CNES)',
        url: 'https://dadosabertos.saude.gov.br/dataset/cnes-cadastro-nacional-de-estabelecimentos-de-saude',
        fields: ['identity', 'address', 'location', 'serviceHours'],
        lastUpdatedAt: '2026-10-14',
      },
    ],
    ...overrides,
  };
}

function build(fetchUnits = vi.fn().mockResolvedValue([unit()])) {
  const replaceState = vi.fn().mockResolvedValue({ deactivated: 2 });
  const service = new UnitsIngestionService(
    { fetchUnits } as unknown as CnesClient,
    { replaceState } as unknown as HealthUnitRepository,
  );
  return { service, fetchUnits, replaceState };
}

describe('UnitsIngestionService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('normalizes the CNES model into an active database entity', async () => {
    const fetchUnits = vi.fn().mockResolvedValue([
      unit({
        address: {
          ...unit().address,
          street: 'A'.repeat(300),
          postalCode: '01001-000',
        },
      }),
    ]);
    const { service, replaceState } = build(fetchUnits);
    const ingestedAt = new Date('2026-10-15T12:00:00Z');

    await expect(service.run([sp], { now: () => ingestedAt })).resolves.toEqual(
      [
        {
          state: 'SP',
          imported: 1,
          deactivated: 2,
          latestSourceUpdate: '2026-10-14',
        },
      ],
    );
    expect(replaceState).toHaveBeenCalledWith('SP', [
      expect.objectContaining({
        cnesCode: '1234567',
        state: 'SP',
        street: 'A'.repeat(255),
        postalCode: '01001000',
        municipalityCode: '355030',
        sourceUpdatedAt: '2026-10-14',
        ingestedAt,
        isActive: true,
      }),
    ]);
  });

  it('retries CNES with progressive delays', async () => {
    const fetchUnits = vi
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue([unit()]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { service } = build(fetchUnits);

    await service.run([sp], { sleep });

    expect(fetchUnits).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it('keeps processing other states and reports every failed state', async () => {
    const fetchUnits = vi.fn((state: BrazilianState) =>
      state.abbreviation === 'SP'
        ? Promise.reject(new Error('CNES unavailable'))
        : Promise.resolve([
            unit({
              id: '7654321',
              address: {
                ...unit().address,
                state: 'RJ',
                city: 'Rio de Janeiro',
              },
            }),
          ]),
    );
    const { service, replaceState } = build(fetchUnits);

    const error = await service
      .run([sp, rj], { sleep: () => Promise.resolve() })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnitsIngestionError);
    expect(error).toMatchObject({
      completed: [{ state: 'RJ', imported: 1 }],
      failures: [{ state: 'SP', reason: 'CNES unavailable' }],
    });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith('RJ', expect.any(Array));
  });

  it('does not replace a state when CNES returns an empty catalog', async () => {
    const { service, replaceState } = build(vi.fn().mockResolvedValue([]));

    await expect(service.run([sp])).rejects.toMatchObject({
      failures: [
        { state: 'SP', reason: 'CNES returned an empty state catalog' },
      ],
    });
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('preserves the state catalog when CNES reports a partial inconsistency', async () => {
    const fetchUnits = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'CNES returned an incomplete collection: 1 of 2 records are inconsistent',
        ),
      );
    const { service, replaceState } = build(fetchUnits);

    await expect(
      service.run([sp], { sleep: () => Promise.resolve() }),
    ).rejects.toMatchObject({
      failures: [
        {
          state: 'SP',
          reason:
            'CNES returned an incomplete collection: 1 of 2 records are inconsistent',
        },
      ],
    });
    expect(fetchUnits).toHaveBeenCalledTimes(3);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
