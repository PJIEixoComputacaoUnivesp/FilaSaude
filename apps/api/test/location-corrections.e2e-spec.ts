import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { LocationCorrectionsService } from './../src/units/location-corrections.service.js';

const MARIA = 'm'.repeat(48);
const JOAO = 'j'.repeat(48);
const TOKENS = `maria:${MARIA},joao:${JOAO}`;
const asMaria = `Bearer ${MARIA}`;
const asJoao = `Bearer ${JOAO}`;
const body = {
  latitude: -23.535249,
  longitude: -46.841459,
  method: 'Conferido no mapa oficial',
};

describe('Location corrections (e2e)', () => {
  let app: INestApplication<Server>;
  const service = {
    list: vi.fn(),
    register: vi.fn(),
    remove: vi.fn(),
  };

  async function start() {
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
  }

  beforeEach(async () => {
    vi.stubEnv('ADMIN_API_TOKENS', TOKENS);
    service.list.mockReset().mockResolvedValue([]);
    service.register.mockReset().mockResolvedValue({
      correction: { cnesCode: '0113360' },
      boundaryChecked: true,
    });
    service.remove.mockReset().mockResolvedValue(undefined);
    await start();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  const routes = [
    ['GET', '/admin/me'],
    ['GET', '/admin/location-corrections'],
    ['PUT', '/admin/location-corrections/0113360'],
    ['DELETE', '/admin/location-corrections/0113360'],
  ] as const;
  const call = (method: string, path: string) =>
    request(app.getHttpServer())[
      method.toLowerCase() as 'get' | 'put' | 'delete'
    ](path);

  describe.each([
    ['no token configured', ''],
    ['a malformed list', `maria:${MARIA},joao:short`],
    ['a bare token', MARIA],
  ])('with %s', (_label, configured) => {
    beforeEach(() => {
      vi.stubEnv('ADMIN_API_TOKENS', configured);
    });

    it.each(routes)(
      'hides %s %s, even for a request that names a token',
      async (method, path) => {
        await call(method, path)
          .set('Authorization', asMaria)
          .send(body)
          .expect(404);

        expect(service.list).not.toHaveBeenCalled();
        expect(service.register).not.toHaveBeenCalled();
        expect(service.remove).not.toHaveBeenCalled();
      },
    );
  });

  describe('with a valid configuration', () => {
    it.each(routes)(
      'rejects %s %s without the token or with a wrong one',
      async (method, path) => {
        await call(method, path).send(body).expect(401);
        await call(method, path)
          .set('Authorization', `Bearer ${'z'.repeat(48)}`)
          .send(body)
          .expect(401);

        expect(service.list).not.toHaveBeenCalled();
        expect(service.register).not.toHaveBeenCalled();
        expect(service.remove).not.toHaveBeenCalled();
      },
    );

    it('says who the token belongs to', async () => {
      await call('GET', '/admin/me')
        .set('Authorization', asMaria)
        .expect(200)
        .expect({ login: 'maria' });
      await call('GET', '/admin/me')
        .set('Authorization', asJoao)
        .expect(200)
        .expect({ login: 'joao' });
    });

    it('lists the corrections', async () => {
      service.list.mockResolvedValue([{ cnesCode: '0113360' }]);

      await call('GET', '/admin/location-corrections')
        .set('Authorization', asMaria)
        .expect(200)
        .expect([{ cnesCode: '0113360' }]);
    });

    it('registers a correction with the code in its 7-digit form', async () => {
      await call('PUT', '/admin/location-corrections/113360')
        .set('Authorization', asMaria)
        .send(body)
        .expect(200)
        .expect({ correction: { cnesCode: '0113360' }, boundaryChecked: true });

      expect(service.register).toHaveBeenCalledWith('0113360', body, 'maria');
    });

    it('records the administrator of the token, not the one the body names', async () => {
      await call('PUT', '/admin/location-corrections/0113360')
        .set('Authorization', asJoao)
        .send({ ...body, verifiedBy: 'maria' })
        .expect(200);

      const [, input, actor] = service.register.mock.calls[0]!;
      expect(actor).toBe('joao');
      expect(input).not.toHaveProperty('verifiedBy');
    });

    it.each([
      ['an invalid code', '/admin/location-corrections/abc', body],
      [
        'a position outside Brazil',
        '/admin/location-corrections/0113360',
        { ...body, latitude: 48.8 },
      ],
      [
        'no method',
        '/admin/location-corrections/0113360',
        { ...body, method: '' },
      ],
      ['an empty body', '/admin/location-corrections/0113360', {}],
    ])(
      'answers 400 for %s without reaching the service',
      async (_label, path, payload) => {
        await call('PUT', path)
          .set('Authorization', asMaria)
          .send(payload)
          .expect(400);

        expect(service.register).not.toHaveBeenCalled();
      },
    );

    it('removes a correction as the administrator of the token', async () => {
      await call('DELETE', '/admin/location-corrections/0113360')
        .set('Authorization', asJoao)
        .expect(204);

      expect(service.remove).toHaveBeenCalledWith('0113360', 'joao');
    });

    it.each([
      ['GET', '/admin/me'],
      ['GET', '/admin/location-corrections'],
      ['PUT', '/admin/location-corrections/0113360'],
      ['DELETE', '/admin/location-corrections/0113360'],
    ])('asks not to cache the response of %s %s', async (method, path) => {
      const response = await call(method, path)
        .set('Authorization', asMaria)
        .send(body);

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('never puts a token in a response', async () => {
      const wrong = await call('GET', '/admin/me').set(
        'Authorization',
        asMaria + 'x',
      );
      const ok = await call('GET', '/admin/me').set('Authorization', asMaria);

      const text = JSON.stringify([
        wrong.body,
        ok.body,
        wrong.headers,
        ok.headers,
      ]);
      expect(text).not.toContain(MARIA);
      expect(text).not.toContain(JOAO);
    });

    it('refuses invalid attempts after too many, and never an administrator', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 25; i++) {
        const response = await call('GET', '/admin/me').set(
          'Authorization',
          `Bearer ${'w'.repeat(48)}`,
        );
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 19).every((status) => status === 401)).toBe(
        true,
      );
      expect(statuses.slice(19).every((status) => status === 429)).toBe(true);
      await call('GET', '/admin/me').set('Authorization', asMaria).expect(200);
      await call('GET', '/admin/me').set('Authorization', asJoao).expect(200);
    });
  });
});
