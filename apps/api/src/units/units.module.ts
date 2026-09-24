import { Module } from '@nestjs/common';
import { CnesClient } from './cnes.client.js';
import { MunicipalitiesClient } from './municipalities.client.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [UnitsController],
  providers: [CnesClient, MunicipalitiesClient, UnitsService],
})
export class UnitsModule {}
