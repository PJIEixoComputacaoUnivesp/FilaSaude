import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { CnesClient } from './cnes.client.js';
import { CnesHistoryClient } from './cnes-history.client.js';
import { LocationCorrectionsController } from './location-corrections.controller.js';
import { LocationCorrectionsService } from './location-corrections.service.js';
import { MunicipalitiesClient } from './municipalities.client.js';
import { MunicipalityBoundariesClient } from './municipality-boundaries.client.js';
import { UnitLocationsService } from './unit-locations.service.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthUnitEntity } from '../database/entities/health-unit.entity.js';
import { UnitLocationCorrectionEntity } from '../database/entities/unit-location-correction.entity.js';
import { HealthUnitRepository } from '../database/repositories/health-unit.repository.js';
import { UnitLocationCorrectionRepository } from '../database/repositories/unit-location-correction.repository.js';

@Module({
  imports: [
    AdminModule,
    TypeOrmModule.forFeature([HealthUnitEntity, UnitLocationCorrectionEntity]),
  ],
  controllers: [UnitsController, LocationCorrectionsController],
  providers: [
    CnesClient,
    CnesHistoryClient,
    MunicipalitiesClient,
    MunicipalityBoundariesClient,
    UnitLocationsService,
    UnitsService,
    HealthUnitRepository,
    UnitLocationCorrectionRepository,
    LocationCorrectionsService,
  ],
})
export class UnitsModule {}
