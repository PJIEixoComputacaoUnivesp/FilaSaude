import { Module } from '@nestjs/common';
import { CnesClient } from './cnes.client.js';
import { MunicipalitiesClient } from './municipalities.client.js';
import { MunicipalityBoundariesClient } from './municipality-boundaries.client.js';
import { UnitLocationsService } from './unit-locations.service.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthUnitEntity } from '../database/entities/health-unit.entity.js';
import { HealthUnitRepository } from '../database/repositories/health-unit.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([HealthUnitEntity])],
  controllers: [UnitsController],
  providers: [
    CnesClient,
    MunicipalitiesClient,
    MunicipalityBoundariesClient,
    UnitLocationsService,
    UnitsService,
    HealthUnitRepository,
  ],
})
export class UnitsModule {}
