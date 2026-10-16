import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from '../database/data-source.js';
import { HealthUnitEntity } from '../database/entities/health-unit.entity.js';
import { HealthUnitRepository } from '../database/repositories/health-unit.repository.js';
import { CnesClient } from '../units/cnes.client.js';
import { MunicipalitiesClient } from '../units/municipalities.client.js';
import { UnitsIngestionService } from './units-ingestion.service.js';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseOptions),
    TypeOrmModule.forFeature([HealthUnitEntity]),
  ],
  providers: [
    CnesClient,
    MunicipalitiesClient,
    HealthUnitRepository,
    UnitsIngestionService,
  ],
})
export class IngestionModule {}
