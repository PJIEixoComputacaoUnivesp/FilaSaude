import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthUnitEntity } from '../entities/health-unit.entity.js';

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
}
