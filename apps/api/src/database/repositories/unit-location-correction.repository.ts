import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitLocationCorrectionEntity } from '../entities/unit-location-correction.entity.js';
import { UnitLocationCorrectionEventEntity } from '../entities/unit-location-correction-event.entity.js';

const EVENTS_LIMIT = 100;

/**
 * Every write goes through a method that records its audit event in the same
 * transaction, so there is no way to change a correction without leaving a
 * trace, and no trace without the change.
 */
@Injectable()
export class UnitLocationCorrectionRepository {
  constructor(
    @InjectRepository(UnitLocationCorrectionEntity)
    private readonly repository: Repository<UnitLocationCorrectionEntity>,
  ) {}

  findAll(): Promise<UnitLocationCorrectionEntity[]> {
    return this.repository.find({ order: { cnesCode: 'ASC' } });
  }

  findByCnesCode(
    cnesCode: string,
  ): Promise<UnitLocationCorrectionEntity | null> {
    return this.repository.findOneBy({ cnesCode });
  }

  /** The most recent events of a unit, newest first. */
  findEvents(cnesCode: string): Promise<UnitLocationCorrectionEventEntity[]> {
    return this.repository.manager.find(UnitLocationCorrectionEventEntity, {
      where: { cnesCode },
      order: { occurredAt: 'DESC', id: 'DESC' },
      take: EVENTS_LIMIT,
    });
  }

  /** Sets or replaces a correction and records who did it. */
  saveWithEvent(
    correction: UnitLocationCorrectionEntity,
    actor: string,
  ): Promise<UnitLocationCorrectionEntity> {
    return this.repository.manager.transaction(async (manager) => {
      // The lock keeps two administrators editing the same unit from
      // recording the same "previous" position.
      const previous = await manager.findOne(UnitLocationCorrectionEntity, {
        where: { cnesCode: correction.cnesCode },
        lock: { mode: 'pessimistic_write' },
      });
      const saved = await manager.save(correction);
      await manager.insert(UnitLocationCorrectionEventEntity, {
        cnesCode: correction.cnesCode,
        action: previous ? 'replace' : 'set',
        actor,
        method: correction.method,
        previousLatitude: previous?.latitude ?? null,
        previousLongitude: previous?.longitude ?? null,
        newLatitude: correction.latitude,
        newLongitude: correction.longitude,
      });
      return saved;
    });
  }

  /** Removes a correction and records who did it. False when there was none. */
  removeWithEvent(cnesCode: string, actor: string): Promise<boolean> {
    return this.repository.manager.transaction(async (manager) => {
      const previous = await manager.findOne(UnitLocationCorrectionEntity, {
        where: { cnesCode },
        lock: { mode: 'pessimistic_write' },
      });
      if (!previous) return false;

      await manager.delete(UnitLocationCorrectionEntity, { cnesCode });
      await manager.insert(UnitLocationCorrectionEventEntity, {
        cnesCode,
        action: 'remove',
        actor,
        method: null,
        previousLatitude: previous.latitude,
        previousLongitude: previous.longitude,
        newLatitude: null,
        newLongitude: null,
      });
      return true;
    });
  }
}
