import { Controller, Get, Query } from '@nestjs/common';
import { UnitsService } from './units.service.js';

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  getUnits(@Query('state') state?: string) {
    return this.unitsService.findAll(state);
  }
}
