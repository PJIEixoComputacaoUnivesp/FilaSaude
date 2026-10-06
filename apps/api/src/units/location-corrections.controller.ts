import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminTokenGuard } from '../admin/admin-token.guard.js';
import {
  parseCnesCode,
  parseCorrectionInput,
} from './location-correction.input.js';
import {
  type AdminCorrection,
  LocationCorrectionsService,
} from './location-corrections.service.js';

/** Administration of the positions set by hand. Requires the admin token. */
@Controller('admin/location-corrections')
@UseGuards(AdminTokenGuard)
export class LocationCorrectionsController {
  constructor(private readonly corrections: LocationCorrectionsService) {}

  @Get()
  list(): Promise<AdminCorrection[]> {
    return this.corrections.list();
  }

  @Put(':cnesCode')
  @HttpCode(200)
  register(
    @Param('cnesCode') cnesCode: string,
    @Body() body: unknown,
  ): Promise<{ correction: AdminCorrection; boundaryChecked: boolean }> {
    return this.corrections.register(
      parseCnesCode(cnesCode),
      parseCorrectionInput(body),
    );
  }

  @Delete(':cnesCode')
  @HttpCode(204)
  remove(@Param('cnesCode') cnesCode: string): Promise<void> {
    return this.corrections.remove(parseCnesCode(cnesCode));
  }
}
