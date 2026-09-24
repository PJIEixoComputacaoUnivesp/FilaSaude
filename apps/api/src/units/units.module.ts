import { Module } from '@nestjs/common';
import { CnesClient } from './cnes.client.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [UnitsController],
  providers: [CnesClient, UnitsService],
})
export class UnitsModule {}
