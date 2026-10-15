import { Module } from '@nestjs/common';
import { BoundariesController } from './boundaries.controller.js';
import { BrazilBoundaryService } from './brazil-boundary.service.js';

@Module({
  controllers: [BoundariesController],
  providers: [BrazilBoundaryService],
})
export class BoundariesModule {}
