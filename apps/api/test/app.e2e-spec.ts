import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { CnesClient } from './../src/units/cnes.client.js';
import { GeoSampaClient } from './../src/units/geosampa.client.js';
import { UnitLocationsService } from './../src/units/unit-locations.service.js';
import type { HealthUnit } from './../src/units/units.types.js';

const testUnit: HealthUnit = {
  id: '1234567',
  name: 'UPA Teste',
  unitType: 'PRONTO ATENDIMENTO',
  address: {
    street: 'Rua Teste',
    number: '10',
    district: 'Centro',
    postalCode: '01001000',
    municipalityCode: '355030',
    city: 'São Paulo',
    state: 'SP',
  },
  location: {
    latitude: -23.55,
    longitude: -46.63,
    precision: 'source',
    original: null,
    referenceMonth: null,
    correctedAt: null,
  },
  serviceHours: 'ATENDIMENTO CONTINUO DE 24 HORAS/DIA',
  lastUpdatedAt: '2026-09-20',
  sources: [
    {
      name: 'Cadastro Nacional de Estabelecimentos de Saúde (CNES)',
      url: 'https://example.com/cnes',
      fields: ['identity', 'address', 'location', 'serviceHours'],
      lastUpdatedAt: '2026-09-20',
    },
  ],
};

describe('AppController (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue({
        entityMetadatas: [],
        getRepository: vi.fn().mockReturnValue({}),
        options: { type: 'postgres' },
      })
      .overrideProvider(CnesClient)
      .useValue({ fetchUnits: vi.fn().mockResolvedValue([testUnit]) })
      .overrideProvider(GeoSampaClient)
      .useValue({ enrichLocations: vi.fn().mockResolvedValue([testUnit]) })
      .overrideProvider(UnitLocationsService)
      .useValue({
        apply: vi.fn((units: HealthUnit[]) =>
          Promise.resolve({ units, validated: true, historyComplete: true }),
        ),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ service: 'fila-saude-api', status: 'ok' });
  });

  it('/units returns national data (GET)', () => {
    return request(app.getHttpServer())
      .get('/units')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.length).toBeGreaterThan(1000);
        expect(body.metadata.state).toBe('BR');
        expect(body.metadata.dataOrigin).toBe('fallback');
      });
  });

  it('/units?state=SP (GET)', () => {
    return request(app.getHttpServer())
      .get('/units?state=SP')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([testUnit]);
        expect(body.metadata.state).toBe('SP');
        expect(body.metadata.dataOrigin).toBe('live');
        expect(body.metadata.source.name).toContain('CNES');
      });
  });

  it('/units rejects an invalid state (GET)', () => {
    return request(app.getHttpServer()).get('/units?state=XX').expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
