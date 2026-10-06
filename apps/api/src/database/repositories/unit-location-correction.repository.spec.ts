import { UnitLocationCorrectionEntity } from '../entities/unit-location-correction.entity.js';
import { UnitLocationCorrectionRepository } from './unit-location-correction.repository.js';

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

  it('delegates persistence to TypeORM', async () => {
    const correction = new UnitLocationCorrectionEntity();
    const save = vi.fn().mockResolvedValue(correction);

    await expect(
      new UnitLocationCorrectionRepository({ save } as never).save(correction),
    ).resolves.toBe(correction);
    expect(save).toHaveBeenCalledWith(correction);
  });

  it.each([
    [1, true],
    [0, false],
    [undefined, false],
  ])(
    'reports whether a delete (affected %s) removed a row',
    async (affected, removed) => {
      const remove = vi.fn().mockResolvedValue({ affected });

      await expect(
        new UnitLocationCorrectionRepository({
          delete: remove,
        } as never).deleteByCnesCode('5563704'),
      ).resolves.toBe(removed);
      expect(remove).toHaveBeenCalledWith({ cnesCode: '5563704' });
    },
  );
});
