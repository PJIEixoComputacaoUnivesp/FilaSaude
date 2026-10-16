import { HealthUnitEntity } from '../entities/health-unit.entity.js';
import { HealthUnitRepository } from './health-unit.repository.js';

describe('HealthUnitRepository', () => {
  it('finds active units ordered by name', async () => {
    const find = vi.fn().mockResolvedValue([]);
    const repository = new HealthUnitRepository({ find } as never);

    await repository.findActive();

    expect(find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  });

  it('filters active units by state', async () => {
    const find = vi.fn().mockResolvedValue([]);
    const repository = new HealthUnitRepository({ find } as never);

    await repository.findActive('SP');

    expect(find).toHaveBeenCalledWith({
      where: { isActive: true, state: 'SP' },
      order: { name: 'ASC' },
    });
  });

  it('delegates batch persistence to TypeORM', async () => {
    const units = [new HealthUnitEntity()];
    const save = vi.fn().mockResolvedValue(units);
    const repository = new HealthUnitRepository({ save } as never);

    await expect(repository.saveMany(units)).resolves.toBe(units);
    expect(save).toHaveBeenCalledWith(units);
  });

  it('atomically upserts a state and deactivates units missing from it', async () => {
    const units = [
      Object.assign(new HealthUnitEntity(), {
        cnesCode: '1234567',
        state: 'SP',
      }),
    ];
    const upsert = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue({ affected: 2 });
    const manager = { upsert, update };
    const transaction = vi.fn(async (work) => work(manager));
    const repository = new HealthUnitRepository({
      manager: { transaction },
    } as never);

    await expect(repository.replaceState('SP', units)).resolves.toEqual({
      deactivated: 2,
    });

    expect(upsert).toHaveBeenCalledWith(HealthUnitEntity, units, {
      conflictPaths: ['cnesCode'],
      skipUpdateIfNoValuesChanged: true,
    });
    expect(update).toHaveBeenCalledWith(
      HealthUnitEntity,
      expect.objectContaining({ state: 'SP', isActive: true }),
      { isActive: false },
    );
  });

  it('refuses an empty or mixed-state replacement before opening a transaction', async () => {
    const transaction = vi.fn();
    const repository = new HealthUnitRepository({
      manager: { transaction },
    } as never);

    await expect(repository.replaceState('SP', [])).rejects.toThrow(
      'empty catalog',
    );
    await expect(
      repository.replaceState('SP', [
        Object.assign(new HealthUnitEntity(), {
          cnesCode: '1234567',
          state: 'RJ',
        }),
      ]),
    ).rejects.toThrow('another state');
    expect(transaction).not.toHaveBeenCalled();
  });
});
