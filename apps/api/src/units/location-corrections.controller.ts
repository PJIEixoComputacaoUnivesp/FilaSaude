import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminLogin } from '../admin/admin.decorator.js';
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
  @Header('Cache-Control', 'no-store')
  list(): Promise<AdminCorrection[]> {
    return this.corrections.list();
  }

  @Put(':cnesCode')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  register(
    @Param('cnesCode') cnesCode: string,
    @Body() body: unknown,
    @AdminLogin() actor: string,
  ): Promise<{ correction: AdminCorrection; boundaryChecked: boolean }> {
    return this.corrections.register(
      parseCnesCode(cnesCode),
      parseCorrectionInput(body),
      actor,
    );
  }

  @Delete(':cnesCode')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  remove(
    @Param('cnesCode') cnesCode: string,
    @AdminLogin() actor: string,
  ): Promise<void> {
    return this.corrections.remove(parseCnesCode(cnesCode), actor);
  }
}
