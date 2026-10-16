import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureApp } from '../src/app-configuration.js';
import { AppModule } from '../src/app.module.js';
import { OccupancyRepository } from '../src/database/repositories/occupancy.repository.js';
import { SimulationControlRepository } from '../src/database/repositories/simulation-control.repository.js';

describe('Occupancy (e2e)', () => {
  let app: NestExpressApplication | undefined;
  const observedAt = new Date();
  const repository = {
    findCurrent: vi.fn().mockResolvedValue([
      {
        unitCnes: '1234567',
        eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
        sourceId: 'occupancy-feed',
        categories: [{ code: 'observation', capacity: 20, occupied: 18 }],
        occurredAt: observedAt,
        observedAt,
        receivedAt: observedAt,
        updatedAt: observedAt,
      },
    ]),
    findCurrentByUnit: vi.fn().mockResolvedValue(null),
    findHistory: vi.fn().mockResolvedValue([]),
  };

  const controlRepository = {
    find: vi.fn().mockResolvedValue(null),
    change: vi.fn(),
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
      .overrideProvider(OccupancyRepository)
      .useValue(repository)
      .overrideProvider(SimulationControlRepository)
      .useValue(controlRepository)
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
    await request(server).get('/units/1234567/occupancy-history').expect(404);
  });

  it('returns the current simulated occupancy, marked as simulation', async () => {
    const response = await request((await start(true)).getHttpServer())
      .get('/occupancy')
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body.metadata.simulated).toBe(true);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        unitCnes: '1234567',
        percentage: 90,
        level: 'high',
        confirmation: 'recent',
      }),
    ]);
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

  it('lets a visitor change the scenario, spaced out', async () => {
    const server = (await start(true)).getHttpServer();
    controlRepository.change.mockImplementationOnce(
      (scenario: string, changedAt: Date, expiresAt: Date) =>
        Promise.resolve({ id: 1, scenario, changedAt, expiresAt }),
    );

    const changed = await request(server)
      .put('/occupancy/simulation')
      .send({ scenario: 'surge' })
      .expect(200);
    expect(changed.body.data.scenario).toBe('surge');

    controlRepository.change.mockResolvedValueOnce(null);
    controlRepository.find.mockResolvedValueOnce({
      id: 1,
      scenario: 'surge',
      changedAt: new Date(),
      expiresAt: new Date(Date.now() + 900_000),
    });
    const refused = await request(server)
      .put('/occupancy/simulation')
      .send({ scenario: 'normal' })
      .expect(429);
    expect(refused.body.code).toBe('scenario_cooldown');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('accepts only known scenarios and only while the simulation is on', async () => {
    const server = (await start(true)).getHttpServer();
    const invalid = await request(server)
      .put('/occupancy/simulation')
      .send({ scenario: 'drop-tables' })
      .expect(400);
    expect(invalid.body.code).toBe('invalid_scenario');

    await app?.close();
    const off = (await start(false)).getHttpServer();
    await request(off).get('/occupancy/simulation').expect(404);
    await request(off)
      .put('/occupancy/simulation')
      .send({ scenario: 'surge' })
      .expect(404);
  });
});
