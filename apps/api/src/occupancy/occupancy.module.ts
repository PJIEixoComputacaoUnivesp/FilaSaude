import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OccupancyCurrentEntity } from '../database/entities/occupancy-current.entity.js';
import { SimulationControlEntity } from '../database/entities/simulation-control.entity.js';
import { OccupancyRepository } from '../database/repositories/occupancy.repository.js';
import { SimulationControlRepository } from '../database/repositories/simulation-control.repository.js';
import { OccupancyProcessorService } from './occupancy-processor.service.js';
import {
  loadOccupancySettings,
  OCCUPANCY_SETTINGS,
} from './occupancy-settings.js';
import { OccupancyController } from './occupancy.controller.js';
import { OccupancyService } from './occupancy.service.js';
import { SimulationControlService } from './simulation-control.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OccupancyCurrentEntity, SimulationControlEntity]),
  ],
  controllers: [OccupancyController],
  providers: [
    { provide: OCCUPANCY_SETTINGS, useFactory: () => loadOccupancySettings() },
    OccupancyRepository,
    OccupancyProcessorService,
    OccupancyService,
    SimulationControlRepository,
    SimulationControlService,
  ],
})
export class OccupancyModule {}
