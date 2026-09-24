import { Controller, Get } from '@nestjs/common';
import { UnitsService } from './units.service.js';

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  getUnits() {
    return this.unitsService.findAll();
  }
}
