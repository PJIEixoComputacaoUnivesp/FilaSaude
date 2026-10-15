import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import request from 'supertest';
import { BoundariesModule } from './../src/boundaries/boundaries.module.js';

type Ring = [number, number][];
interface BoundaryResponse {
  data: {
    type: string;
    geometry: { type: string; coordinates: Ring[][] };
  };
  metadata: {
    detail: string;
    boundaryYear: number;
    source: { name: string; url: string };
  };
}

const pointCount = (body: BoundaryResponse) =>
  body.data.geometry.coordinates.flat(2).length;

describe('BoundariesController (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [BoundariesModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a light outline by default, with its source', async () => {
    const response = await request(app.getHttpServer())
      .get('/boundaries/brazil')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect('Cache-Control', 'public, max-age=86400');
    const body = response.body as BoundaryResponse;

    expect(body.data.type).toBe('Feature');
    expect(body.data.geometry.type).toBe('MultiPolygon');
    expect(body.metadata).toMatchObject({
      detail: 'low',
      boundaryYear: 2025,
      source: { url: expect.stringContaining('ibge.gov.br') },
    });
    expect(pointCount(body)).toBeLessThan(20_000);
  });

  it('keeps every polygon and closes every ring in the light outline', async () => {
    const low = await request(app.getHttpServer()).get(
      '/boundaries/brazil?detail=low',
    );
    const high = await request(app.getHttpServer()).get(
      '/boundaries/brazil?detail=high',
    );
    const lowRings = (low.body as BoundaryResponse).data.geometry.coordinates;
    const highRings = (high.body as BoundaryResponse).data.geometry.coordinates;

    // Oceanic islands (Fernando de Noronha, Trindade) stay in the mask.
    expect(lowRings).toHaveLength(highRings.length);
    for (const ring of lowRings.flat()) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring.at(-1)).toEqual(ring[0]);
    }
  });

  it('serves the full outline on request', async () => {
    const response = await request(app.getHttpServer())
      .get('/boundaries/brazil?detail=high')
      .expect(200);
    const body = response.body as BoundaryResponse;

    expect(body.metadata.detail).toBe('high');
    expect(pointCount(body)).toBeGreaterThan(100_000);
  });

  it('answers a conditional request with 304', async () => {
    const first = await request(app.getHttpServer()).get('/boundaries/brazil');
    const etag = first.headers.etag as string;

    // Computed once at startup: strong, not Express's weak per-request hash.
    expect(etag).toMatch(/^"[\w-]+"$/);
    await request(app.getHttpServer())
      .get('/boundaries/brazil')
      .set('If-None-Match', etag)
      .expect(304);
  });

  it('rejects an unknown level of detail, without caching the error', async () => {
    const response = await request(app.getHttpServer())
      .get('/boundaries/brazil?detail=max')
      .expect(400);

    expect((response.body as { message: string }).message).toBe(
      'Invalid boundary detail',
    );
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
