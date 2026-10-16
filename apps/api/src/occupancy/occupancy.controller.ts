import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  OCCUPANCY_SETTINGS,
  type OccupancySettings,
} from './occupancy-settings.js';
import {
  SimulationControlService,
  type SimulationControlResponse,
} from './simulation-control.service.js';
import { isSimulationScenarioId } from './simulation-scenarios.js';
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
    private readonly control: SimulationControlService,
    @Inject(OCCUPANCY_SETTINGS) private readonly settings: OccupancySettings,
  ) {}

  @Get('occupancy')
  @Header('Cache-Control', 'no-cache')
  findCurrent(): Promise<OccupancyResponse> {
    this.assertEnabled();
    return this.occupancy.findCurrent();
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

  /**
   * The scenario the simulator plays, read by the site and by the simulator.
   * Changing it is open to any visitor, for the demonstration; the service
   * spaces changes out and returns to the default after a while.
   */
  @Get('occupancy/simulation')
  @Header('Cache-Control', 'no-cache')
  findSimulation(): Promise<SimulationControlResponse> {
    this.assertEnabled();
    return this.control.find();
  }

  @Put('occupancy/simulation')
  @Header('Cache-Control', 'no-store')
  async changeSimulation(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SimulationControlResponse> {
    this.assertEnabled();
    const scenario =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).scenario
        : undefined;
    if (!isSimulationScenarioId(scenario)) {
      throw new BadRequestException({
        code: 'invalid_scenario',
        message: 'Cenário de simulação desconhecido.',
      });
    }

    const result = await this.control.change(scenario);
    if (result.status === 'cooldown') {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        {
          code: 'scenario_cooldown',
          message: 'O cenário acabou de ser trocado. Aguarde alguns segundos.',
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return result.response;
  }

  private assertEnabled(): void {
    if (!this.settings.publicEnabled) throw new NotFoundException();
  }
}
