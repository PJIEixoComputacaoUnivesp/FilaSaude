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

  /**
   * Holds an advisory lock on the unit until the transaction ends. A row lock
   * would not do: when the unit has no correction yet there is no row, so two
   * administrators creating the first one would not wait for each other, and
   * one would fail on the primary key. Different units hash to the same lock
   * only by chance, which merely makes them wait.
   */
  private async lockUnit(
    manager: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    cnesCode: string,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      cnesCode,
    ]);
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
      await this.lockUnit(manager, correction.cnesCode);
      const previous = await manager.findOne(UnitLocationCorrectionEntity, {
        where: { cnesCode: correction.cnesCode },
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
      await this.lockUnit(manager, cnesCode);
      const previous = await manager.findOne(UnitLocationCorrectionEntity, {
        where: { cnesCode },
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
