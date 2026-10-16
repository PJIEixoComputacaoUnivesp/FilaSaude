import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { HealthUnitEntity } from '../entities/health-unit.entity.js';

const UPSERT_BATCH_SIZE = 1_000;

@Injectable()
export class HealthUnitRepository {
  constructor(
    @InjectRepository(HealthUnitEntity)
    private readonly repository: Repository<HealthUnitEntity>,
  ) {}

  findActive(state?: string): Promise<HealthUnitEntity[]> {
    return this.repository.find({
      where: state ? { isActive: true, state } : { isActive: true },
      order: { name: 'ASC' },
    });
  }

  saveMany(units: HealthUnitEntity[]): Promise<HealthUnitEntity[]> {
    return this.repository.save(units);
  }

  /**
   * Replaces the active CNES catalog of one state atomically. A failed fetch
   * never calls this method, so the previous valid state remains available.
   */
  async replaceState(
    state: string,
    units: HealthUnitEntity[],
  ): Promise<{ deactivated: number }> {
    if (units.length === 0) {
      throw new Error(`Refusing to replace ${state} with an empty catalog`);
    }
    if (units.some((unit) => unit.state !== state)) {
      throw new Error(`Catalog for ${state} contains a unit from another state`);
    }

    return this.repository.manager.transaction(async (manager) => {
      for (let index = 0; index < units.length; index += UPSERT_BATCH_SIZE) {
        await manager.upsert(
          HealthUnitEntity,
          units.slice(index, index + UPSERT_BATCH_SIZE),
          {
            conflictPaths: ['cnesCode'],
            skipUpdateIfNoValuesChanged: true,
          },
        );
      }
      const result = await manager.update(
        HealthUnitEntity,
        {
          state,
          isActive: true,
          cnesCode: Not(In(units.map((unit) => unit.cnesCode))),
        },
        { isActive: false },
      );
      return { deactivated: result.affected ?? 0 };
    });
  }
}
