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
});
