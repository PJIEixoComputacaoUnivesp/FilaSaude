import { UnitLocationCorrectionEntity } from '../entities/unit-location-correction.entity.js';
import { UnitLocationCorrectionEventEntity } from '../entities/unit-location-correction-event.entity.js';
import { UnitLocationCorrectionRepository } from './unit-location-correction.repository.js';

function correction(
  overrides: Partial<UnitLocationCorrectionEntity> = {},
): UnitLocationCorrectionEntity {
  return Object.assign(new UnitLocationCorrectionEntity(), {
    cnesCode: '5563704',
    latitude: -23.5343,
    longitude: -46.8368,
    method: 'Conferido no mapa oficial',
    ...overrides,
  });
}

/** A manager whose transaction runs the work on the manager itself. */
function managerWith(overrides: Record<string, unknown> = {}) {
  const manager = {
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn((entity: unknown) => Promise.resolve(entity)),
    insert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(),
    ...overrides,
  };
  manager.transaction.mockImplementation((work: (m: unknown) => unknown) =>
    work(manager),
  );
  return manager;
}

const repositoryOn = (manager: unknown, others: Record<string, unknown> = {}) =>
  new UnitLocationCorrectionRepository({ manager, ...others } as never);

describe('UnitLocationCorrectionRepository', () => {
  it('lists the corrections ordered by CNES code', async () => {
    const find = vi.fn().mockResolvedValue([]);

    await new UnitLocationCorrectionRepository({ find } as never).findAll();

    expect(find).toHaveBeenCalledWith({ order: { cnesCode: 'ASC' } });
  });

  it('finds one correction by CNES code', async () => {
    const findOneBy = vi.fn().mockResolvedValue(null);

    await new UnitLocationCorrectionRepository({
      findOneBy,
    } as never).findByCnesCode('5563704');

    expect(findOneBy).toHaveBeenCalledWith({ cnesCode: '5563704' });
  });

  it('reads the events of a unit, newest first and bounded', async () => {
    const manager = managerWith();

    await repositoryOn(manager).findEvents('5563704');

    expect(manager.find).toHaveBeenCalledWith(
      UnitLocationCorrectionEventEntity,
      {
        where: { cnesCode: '5563704' },
        order: { occurredAt: 'DESC', id: 'DESC' },
        take: 100,
      },
    );
  });

  describe('saveWithEvent', () => {
    it('records a "set" event for a unit that had no correction', async () => {
      const manager = managerWith();
      const next = correction();

      const saved = await repositoryOn(manager).saveWithEvent(next, 'maria');

      expect(saved).toBe(next);
      expect(manager.insert).toHaveBeenCalledWith(
        UnitLocationCorrectionEventEntity,
        {
          cnesCode: '5563704',
          action: 'set',
          actor: 'maria',
          method: 'Conferido no mapa oficial',
          previousLatitude: null,
          previousLongitude: null,
          newLatitude: -23.5343,
          newLongitude: -46.8368,
        },
      );
    });

    it('records a "replace" event with the position it replaced', async () => {
      const manager = managerWith({
        findOne: vi
          .fn()
          .mockResolvedValue(correction({ latitude: -20, longitude: -40 })),
      });

      await repositoryOn(manager).saveWithEvent(correction(), 'joao');

      expect(manager.insert).toHaveBeenCalledWith(
        UnitLocationCorrectionEventEntity,
        expect.objectContaining({
          action: 'replace',
          actor: 'joao',
          previousLatitude: -20,
          previousLongitude: -40,
          newLatitude: -23.5343,
        }),
      );
    });

    it('serializes writers of the same unit with an advisory lock, even when no row exists yet', async () => {
      const manager = managerWith();

      await repositoryOn(manager).saveWithEvent(correction(), 'maria');

      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['5563704'],
      );
      // The lock is taken before the current row is read, or two creators
      // would both read "no row".
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.findOne.mock.invocationCallOrder[0]!,
      );
    });

    it('reads the current row without a row lock, which would lock nothing when it is missing', async () => {
      const manager = managerWith();

      await repositoryOn(manager).saveWithEvent(correction(), 'maria');

      expect(manager.findOne).toHaveBeenCalledWith(
        UnitLocationCorrectionEntity,
        {
          where: { cnesCode: '5563704' },
        },
      );
    });

    it('changes the correction and records the event inside one transaction', async () => {
      const manager = managerWith();

      await repositoryOn(manager).saveWithEvent(correction(), 'maria');

      expect(manager.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save.mock.invocationCallOrder[0]).toBeLessThan(
        manager.insert.mock.invocationCallOrder[0]!,
      );
    });

    it('fails, so the transaction rolls back, when the event cannot be recorded', async () => {
      const manager = managerWith({
        insert: vi.fn().mockRejectedValue(new Error('disk full')),
      });

      await expect(
        repositoryOn(manager).saveWithEvent(correction(), 'maria'),
      ).rejects.toThrow('disk full');
    });
  });

  describe('removeWithEvent', () => {
    it('removes the correction and records the position it had', async () => {
      const manager = managerWith({
        findOne: vi.fn().mockResolvedValue(correction()),
      });

      await expect(
        repositoryOn(manager).removeWithEvent('5563704', 'joao'),
      ).resolves.toBe(true);

      expect(manager.delete).toHaveBeenCalledWith(
        UnitLocationCorrectionEntity,
        {
          cnesCode: '5563704',
        },
      );
      expect(manager.insert).toHaveBeenCalledWith(
        UnitLocationCorrectionEventEntity,
        {
          cnesCode: '5563704',
          action: 'remove',
          actor: 'joao',
          method: null,
          previousLatitude: -23.5343,
          previousLongitude: -46.8368,
          newLatitude: null,
          newLongitude: null,
        },
      );
    });

    it('takes the same advisory lock before looking for the correction', async () => {
      const manager = managerWith({
        findOne: vi.fn().mockResolvedValue(correction()),
      });

      await repositoryOn(manager).removeWithEvent('5563704', 'joao');

      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['5563704'],
      );
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.findOne.mock.invocationCallOrder[0]!,
      );
    });

    it('reports a unit with no correction without recording anything', async () => {
      const manager = managerWith();

      await expect(
        repositoryOn(manager).removeWithEvent('5563704', 'joao'),
      ).resolves.toBe(false);

      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });

  it('has no way to change a correction without recording who did it', () => {
    const methods = Object.getOwnPropertyNames(
      UnitLocationCorrectionRepository.prototype,
    );

    expect(methods).not.toContain('save');
    expect(methods).not.toContain('delete');
    expect(methods).not.toContain('deleteByCnesCode');
  });
});
