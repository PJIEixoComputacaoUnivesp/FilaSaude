import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OccupancyCurrentEntity } from '../database/entities/occupancy-current.entity.js';
import { OccupancyRepository } from '../database/repositories/occupancy.repository.js';
import { OccupancyProcessorService } from './occupancy-processor.service.js';
import {
  loadOccupancySettings,
  OCCUPANCY_SETTINGS,
} from './occupancy-settings.js';
import { OccupancyController } from './occupancy.controller.js';
import { OccupancyService } from './occupancy.service.js';
import { OccupancyStreamService } from './occupancy-stream.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([OccupancyCurrentEntity])],
  controllers: [OccupancyController],
  providers: [
    { provide: OCCUPANCY_SETTINGS, useFactory: () => loadOccupancySettings() },
    OccupancyRepository,
    OccupancyProcessorService,
    OccupancyService,
    OccupancyStreamService,
  ],
})
export class OccupancyModule {}
