import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { LocationCorrectionsService } from './../src/units/location-corrections.service.js';

const TOKEN = 'k'.repeat(48);
const bearer = `Bearer ${TOKEN}`;
const body = {
  latitude: -23.535249,
  longitude: -46.841459,
  verifiedBy: 'Maria Souza',
  method: 'Conferido no mapa oficial',
};

describe('Location corrections (e2e)', () => {
  let app: INestApplication<Server>;
  const service = {
    list: vi.fn(),
    register: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.stubEnv('ADMIN_API_TOKEN', TOKEN);
    service.list.mockReset().mockResolvedValue([]);
    service.register
      .mockReset()
      .mockResolvedValue({
        correction: { cnesCode: '0113360' },
        boundaryChecked: true,
      });
    service.remove.mockReset().mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue({
        entityMetadatas: [],
        getRepository: vi.fn().mockReturnValue({}),
        options: { type: 'postgres' },
      })
      .overrideProvider(LocationCorrectionsService)
      .useValue(service)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  describe('without a configured token', () => {
    beforeEach(() => {
      vi.stubEnv('ADMIN_API_TOKEN', '');
    });

    it.each([
      ['GET', '/admin/location-corrections'],
      ['PUT', '/admin/location-corrections/0113360'],
      ['DELETE', '/admin/location-corrections/0113360'],
    ])(
      'hides %s %s, even for a request that names a token',
      async (method, path) => {
        const call = request(app.getHttpServer())[
          method.toLowerCase() as 'get' | 'put' | 'delete'
        ](path);

        await call.set('Authorization', bearer).send(body).expect(404);
        expect(service.list).not.toHaveBeenCalled();
        expect(service.register).not.toHaveBeenCalled();
        expect(service.remove).not.toHaveBeenCalled();
      },
    );
  });

  describe('with a configured token', () => {
    it.each([
      ['GET', '/admin/location-corrections'],
      ['PUT', '/admin/location-corrections/0113360'],
      ['DELETE', '/admin/location-corrections/0113360'],
    ])('rejects %s %s without the token', async (method, path) => {
      const call = request(app.getHttpServer())[
        method.toLowerCase() as 'get' | 'put' | 'delete'
      ](path);

      await call.send(body).expect(401);
      await request(app.getHttpServer())
        [method.toLowerCase() as 'get' | 'put' | 'delete'](path)
        .set('Authorization', `Bearer ${'z'.repeat(48)}`)
        .send(body)
        .expect(401);
      expect(service.list).not.toHaveBeenCalled();
      expect(service.register).not.toHaveBeenCalled();
      expect(service.remove).not.toHaveBeenCalled();
    });

    it('lists the corrections', async () => {
      service.list.mockResolvedValue([{ cnesCode: '0113360' }]);

      await request(app.getHttpServer())
        .get('/admin/location-corrections')
        .set('Authorization', bearer)
        .expect(200)
        .expect([{ cnesCode: '0113360' }]);
    });

    it('registers a correction with the code in its 7-digit form', async () => {
      await request(app.getHttpServer())
        .put('/admin/location-corrections/113360')
        .set('Authorization', bearer)
        .send(body)
        .expect(200)
        .expect({ correction: { cnesCode: '0113360' }, boundaryChecked: true });

      expect(service.register).toHaveBeenCalledWith('0113360', body);
    });

    it.each([
      ['an invalid code', '/admin/location-corrections/abc', body],
      [
        'a position outside Brazil',
        '/admin/location-corrections/0113360',
        { ...body, latitude: 48.8 },
      ],
      [
        'no verifier',
        '/admin/location-corrections/0113360',
        { ...body, verifiedBy: '' },
      ],
      ['an empty body', '/admin/location-corrections/0113360', {}],
    ])(
      'answers 400 for %s without reaching the service',
      async (_label, path, payload) => {
        await request(app.getHttpServer())
          .put(path)
          .set('Authorization', bearer)
          .send(payload)
          .expect(400);

        expect(service.register).not.toHaveBeenCalled();
      },
    );

    it('removes a correction', async () => {
      await request(app.getHttpServer())
        .delete('/admin/location-corrections/0113360')
        .set('Authorization', bearer)
        .expect(204);

      expect(service.remove).toHaveBeenCalledWith('0113360');
    });

    it('never puts the token in a response', async () => {
      const unauthorized = await request(app.getHttpServer())
        .get('/admin/location-corrections')
        .set('Authorization', bearer + 'x');
      const ok = await request(app.getHttpServer())
        .get('/admin/location-corrections')
        .set('Authorization', bearer);

      expect(JSON.stringify([unauthorized.body, ok.body])).not.toContain(TOKEN);
    });
  });
});
