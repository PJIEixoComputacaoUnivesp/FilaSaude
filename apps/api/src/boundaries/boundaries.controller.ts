import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import {
  BOUNDARY_DETAILS,
  type BoundaryDetail,
  BrazilBoundaryService,
} from './brazil-boundary.service.js';

function parseDetail(detail: string | undefined): BoundaryDetail {
  if (detail === undefined) return 'low';
  if ((BOUNDARY_DETAILS as readonly string[]).includes(detail)) {
    return detail as BoundaryDetail;
  }
  throw new BadRequestException('Invalid boundary detail');
}

@Controller('boundaries')
export class BoundariesController {
  constructor(private readonly brazilBoundary: BrazilBoundaryService) {}

  /**
   * The outline of Brazil. `low` (the default) is enough up to zoom 7 of the
   * map; `high` keeps the detail of the IBGE file. It only changes with a new
   * release, so it can be cached for a day; Express adds the ETag that
   * revalidates it after that.
   */
  @Get('brazil')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  brazil(@Query('detail') detail?: string): string {
    return this.brazilBoundary.response(parseDetail(detail));
  }
}
