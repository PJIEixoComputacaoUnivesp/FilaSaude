import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { CnesClient } from './../src/units/cnes.client.js';
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
    city: 'São Paulo',
    state: 'SP',
  },
  location: { latitude: -23.55, longitude: -46.63 },
  serviceHours: 'ATENDIMENTO CONTINUO DE 24 HORAS/DIA',
  lastUpdatedAt: '2026-09-20',
};

describe('AppController (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CnesClient)
      .useValue({ fetchUnits: vi.fn().mockResolvedValue([testUnit]) })
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

  it('/units (GET)', () => {
    return request(app.getHttpServer())
      .get('/units')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([testUnit]);
        expect(body.metadata.dataOrigin).toBe('live');
        expect(body.metadata.source.name).toContain('CNES');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
