import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { OccupancyStreamService } from './occupancy-stream.service.js';
import {
  OCCUPANCY_SETTINGS,
  type OccupancySettings,
} from './occupancy-settings.js';
import {
  OccupancyService,
  type OccupancyHistoryResponse,
  type OccupancyResponse,
} from './occupancy.service.js';

/**
 * Public, read-only view of the simulated occupancy. Without
 * OCCUPANCY_SIMULATION_ENABLED the routes answer 404, so the site shows only
 * registry data. Units are returned in CNES order: nothing here ranks them.
 */
@Controller()
export class OccupancyController {
  constructor(
    private readonly occupancy: OccupancyService,
    private readonly updates: OccupancyStreamService,
    @Inject(OCCUPANCY_SETTINGS) private readonly settings: OccupancySettings,
  ) {}

  /**
   * Lets the site offer the layer without loading it. It reads no data, so
   * the switch does not depend on the national snapshot.
   */
  @Get('occupancy/availability')
  @Header('Cache-Control', 'no-cache')
  availability(): { simulated: true } {
    this.assertEnabled();
    return { simulated: true };
  }

  @Get('occupancy')
  @Header('Cache-Control', 'no-cache')
  findCurrent(): Promise<OccupancyResponse> {
    this.assertEnabled();
    return this.occupancy.findCurrent();
  }

  @Sse('occupancy/stream')
  @Header('X-Accel-Buffering', 'no')
  stream(): Observable<MessageEvent> {
    this.assertEnabled();
    return this.updates.stream();
  }

  @Get('units/:cnes/occupancy-history')
  @Header('Cache-Control', 'no-cache')
  findHistory(@Param('cnes') cnes: string): Promise<OccupancyHistoryResponse> {
    this.assertEnabled();
    if (!/^\d{7}$/.test(cnes)) {
      throw new BadRequestException({
        code: 'invalid_cnes',
        message: 'O código CNES deve ter sete dígitos.',
      });
    }
    return this.occupancy.findHistory(cnes);
  }

  private assertEnabled(): void {
    if (!this.settings.publicEnabled) throw new NotFoundException();
  }
}
