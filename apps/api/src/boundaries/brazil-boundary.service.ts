import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Polygon } from '../units/geometry.js';
import { simplifyPolygons } from './simplify.js';

export const BOUNDARY_DETAILS = ['low', 'high'] as const;
export type BoundaryDetail = (typeof BOUNDARY_DETAILS)[number];

// One degree of longitude is 256 * 2^z / 360 px of the web map at zoom z, so
// 0.01° is about 0.45 px at zoom 6 and 0.9 px at zoom 7. The map switches to
// `high` above that. Latitude is stretched by Mercator (about 1.2x at -34°),
// which keeps it close to a pixel there too.
const LOW_DETAIL_TOLERANCE_DEGREES = 0.01;
// 0.001° is about 0.1 px at zoom 7, and three decimals instead of six make
// the light outline about half as large.
const LOW_DETAIL_DECIMALS = 3;

interface BoundaryFile {
  type: 'Feature';
  properties: {
    source: string;
    sourceUrl: string;
    boundaryYear: number;
  };
  geometry: { type: 'MultiPolygon'; coordinates: Polygon[] };
}

function parseBoundaryFile(text: string): BoundaryFile {
  const file = JSON.parse(text) as Partial<BoundaryFile>;
  if (
    file.type !== 'Feature' ||
    file.geometry?.type !== 'MultiPolygon' ||
    !Array.isArray(file.geometry.coordinates) ||
    typeof file.properties?.source !== 'string' ||
    typeof file.properties.sourceUrl !== 'string' ||
    typeof file.properties.boundaryYear !== 'number'
  ) {
    throw new Error('Invalid Brazil boundary file');
  }
  return file as BoundaryFile;
}

export interface BoundaryResponse {
  body: string;
  /** Strong ETag of the body, so Express does not hash 3 MB per request. */
  etag: string;
}

/**
 * The outline of Brazil from IBGE, which the map uses as a mask. The file is
 * read and simplified once, at startup, and each level is kept serialized
 * with its ETag, so a request only sends a string.
 */
@Injectable()
export class BrazilBoundaryService implements OnModuleInit {
  private readonly responses = new Map<BoundaryDetail, BoundaryResponse>();

  async onModuleInit(): Promise<void> {
    const file = parseBoundaryFile(
      await readFile(new URL('./brazil-boundary.json', import.meta.url), 'utf8'),
    );
    const { source, sourceUrl, boundaryYear } = file.properties;
    const coordinates: Record<BoundaryDetail, Polygon[]> = {
      low: simplifyPolygons(
        file.geometry.coordinates,
        LOW_DETAIL_TOLERANCE_DEGREES,
        LOW_DETAIL_DECIMALS,
      ),
      high: file.geometry.coordinates,
    };

    for (const detail of BOUNDARY_DETAILS) {
      const body = JSON.stringify({
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'MultiPolygon', coordinates: coordinates[detail] },
        },
        metadata: {
          detail,
          boundaryYear,
          source: { name: source, url: sourceUrl },
        },
      });
      const hash = createHash('sha1').update(body).digest('base64url');
      this.responses.set(detail, { body, etag: `"${hash}"` });
    }
  }

  /** The serialized response for one level of detail. */
  response(detail: BoundaryDetail): BoundaryResponse {
    const response = this.responses.get(detail);
    if (response === undefined) throw new Error('Boundary not loaded');
    return response;
  }
}
