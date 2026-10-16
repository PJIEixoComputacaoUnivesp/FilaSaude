import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
   * release, so it can be cached for a day and revalidated with its ETag
   * after that. The headers are set here, after validation, so an error is
   * never cached.
   */
  @Get('brazil')
  brazil(
    @Query('detail') detail: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): string {
    const { body, etag } = this.brazilBoundary.response(parseDetail(detail));
    response.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      ETag: etag,
    });
    return body;
  }
}
