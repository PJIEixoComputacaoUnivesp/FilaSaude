import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitLocationCorrectionEntity } from '../entities/unit-location-correction.entity.js';

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

  save(
    correction: UnitLocationCorrectionEntity,
  ): Promise<UnitLocationCorrectionEntity> {
    return this.repository.save(correction);
  }

  /** Returns whether a correction existed. */
  async deleteByCnesCode(cnesCode: string): Promise<boolean> {
    const result = await this.repository.delete({ cnesCode });
    return (result.affected ?? 0) > 0;
  }
}
