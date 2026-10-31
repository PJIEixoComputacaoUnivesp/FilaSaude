import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { of } from 'rxjs';
import { OccupancyStreamService } from '../src/occupancy/occupancy-stream.service.js';
import { configureApp } from '../src/app-configuration.js';
import { AppModule } from '../src/app.module.js';
import { OccupancyRepository } from '../src/database/repositories/occupancy.repository.js';

describe('Occupancy (e2e)', () => {
  let app: NestExpressApplication | undefined;
  const observedAt = new Date();
  const repository = {
    findWaitBaselines: vi.fn().mockResolvedValue(new Map()),
    findWaitEstimateHistory: vi.fn().mockResolvedValue(new Map()),
    findCurrent: vi.fn().mockResolvedValue([
      {
        unitCnes: '1234567',
        eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
        sourceId: 'occupancy-feed',
        categories: [{ code: 'observation', capacity: 20, occupied: 18 }],
        attendance: { waiting: 2, inService: 3, serviceSlots: 4 },
        occurredAt: observedAt,
        observedAt,
        receivedAt: observedAt,
        updatedAt: observedAt,
      },
    ]),
    findCurrentByUnit: vi.fn().mockResolvedValue(null),
    findHistory: vi.fn().mockResolvedValue([]),
  };

  async function start(enabled: boolean) {
    process.env.OCCUPANCY_SIMULATION_ENABLED = enabled ? 'true' : 'false';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue({
        entityMetadatas: [],
        getRepository: vi.fn().mockReturnValue({}),
        options: { type: 'postgres' },
      })
      .overrideProvider(OccupancyStreamService)
      .useValue({
        stream: () => of({ id: '1', type: 'ready', data: { simulated: true } }),
      })
      .overrideProvider(OccupancyRepository)
      .useValue(repository)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    return app;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
    delete process.env.OCCUPANCY_SIMULATION_ENABLED;
  });

  it('does not exist while the simulation is off', async () => {
    const server = (await start(false)).getHttpServer();

    await request(server).get('/occupancy').expect(404);
    await request(server).get('/occupancy/availability').expect(404);
    await request(server).get('/occupancy/stream').expect(404);
    await request(server).get('/units/1234567/occupancy-history').expect(404);
  });

  it('offers the layer without reading the occupancy', async () => {
    const server = (await start(true)).getHttpServer();
    const before = repository.findCurrent.mock.calls.length;

    await request(server)
      .get('/occupancy/availability')
      .expect(200)
      .expect({ simulated: true });

    expect(repository.findCurrent.mock.calls.length).toBe(before);
  });

  it('returns the current simulated occupancy, marked as simulation', async () => {
    const response = await request((await start(true)).getHttpServer())
      .get('/occupancy')
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body.metadata.simulated).toBe(true);
    expect(response.body.metadata.waitingThresholds).toEqual({
      moderate: 1,
      high: 3,
    });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        unitCnes: '1234567',
        percentage: 90,
        level: 'high',
        confirmation: 'recent',
        indicators: { beds: 'high', waiting: 'low' },
        levelDrivers: ['beds'],
        attendance: { waiting: 2, inService: 3, serviceSlots: 4 },
      }),
    ]);
  });

  it('exposes SSE with buffering disabled and simulation metadata', async () => {
    const response = await request((await start(true)).getHttpServer())
      .get('/occupancy/stream')
      .expect(200)
      .expect('Content-Type', /text\/event-stream/)
      .expect('X-Accel-Buffering', 'no');
    expect(response.text).toContain('event: ready');
    expect(response.text).toContain('id: 1');
    expect(response.text).toContain('"simulated":true');
  });

  it('returns the history of a unit and validates the CNES code', async () => {
    const server = (await start(true)).getHttpServer();

    const response = await request(server)
      .get('/units/1234567/occupancy-history')
      .expect(200);
    expect(response.body).toMatchObject({
      data: { unitCnes: '1234567', current: null, history: [] },
      metadata: { simulated: true, periodHours: 24 },
    });

    const invalid = await request(server)
      .get('/units/12ab/occupancy-history')
      .expect(400);
    expect(invalid.body.code).toBe('invalid_cnes');
  });

  it('does not expose public controls for the national sources', async () => {
    const server = (await start(true)).getHttpServer();
    await request(server).get('/occupancy/simulation').expect(404);
    await request(server)
      .put('/occupancy/simulation')
      .send({ scenario: 'outage' })
      .expect(404);
  });
});
