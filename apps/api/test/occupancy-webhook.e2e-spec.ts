import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { createHmac } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureApp } from '../src/app-configuration.js';
import { AppModule } from '../src/app.module.js';
import type { OccupancyWebhookInboxEntity } from '../src/database/entities/occupancy-webhook-inbox.entity.js';
import { OccupancyWebhookInboxRepository } from '../src/database/repositories/occupancy-webhook-inbox.repository.js';
import { WebhookSourceConfigService } from '../src/webhooks/webhook-source-config.service.js';

describe('Occupancy webhook (e2e)', () => {
  let app: NestExpressApplication;
  const secret = 'test-secret';
  const entries = new Map<string, OccupancyWebhookInboxEntity>();
  const repository = {
    findByEventId: vi.fn((eventId: string) =>
      Promise.resolve(entries.get(eventId) ?? null),
    ),
    insert: vi.fn((entry: OccupancyWebhookInboxEntity) => {
      entries.set(entry.eventId, entry);
      return Promise.resolve(entry);
    }),
  };

  beforeEach(async () => {
    entries.clear();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue({
        entityMetadatas: [],
        getRepository: vi.fn().mockReturnValue({}),
        options: { type: 'postgres' },
      })
      .overrideProvider(OccupancyWebhookInboxRepository)
      .useValue(repository)
      .overrideProvider(WebhookSourceConfigService)
      .useValue({
        find: vi.fn().mockReturnValue({ secret, unitCnes: ['1234567'] }),
      })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
  });

  it('accepts and persists a valid signed snapshot', async () => {
    const rawBody = JSON.stringify({
      eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
      type: 'occupancy.snapshot.v1',
      unitCnes: '1234567',
      occurredAt: '2026-09-25T14:30:00-03:00',
      observedAt: '2026-09-25T14:30:05-03:00',
      categories: [{ code: 'observation', capacity: 20, occupied: 13 }],
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    await request(app.getHttpServer())
      .post('/webhooks/v1/occupancy')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Source', 'academic-simulator')
      .set('X-Webhook-Timestamp', timestamp)
      .set('X-Webhook-Signature', `sha256=${signature}`)
      .send(rawBody)
      .expect(202);

    expect(repository.insert).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid signature without exposing details', async () => {
    const rawBody = JSON.stringify({
      eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
      type: 'occupancy.snapshot.v1',
      unitCnes: '1234567',
      occurredAt: '2026-09-25T14:30:00-03:00',
      observedAt: '2026-09-25T14:30:05-03:00',
      categories: [{ code: 'observation', capacity: 20, occupied: 13 }],
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    await request(app.getHttpServer())
      .post('/webhooks/v1/occupancy')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Source', 'academic-simulator')
      .set('X-Webhook-Timestamp', timestamp)
      .set('X-Webhook-Signature', `sha256=${'0'.repeat(64)}`)
      .send(rawBody)
      .expect(401)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'invalid_webhook_authentication',
          message: 'Cabeçalhos de autenticação inválidos.',
        });
      });
  });

  it('rejects an unsupported content type before reading the raw body', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/v1/occupancy')
      .set('Content-Type', 'text/plain')
      .send('not-json')
      .expect(415)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'unsupported_content_type',
          message: 'O Content-Type deve ser application/json.',
        });
      });
  });

  it('normalizes malformed JSON parser errors', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/v1/occupancy')
      .set('Content-Type', 'application/json')
      .send('{"eventId":')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'malformed_json',
          message: 'O corpo não contém JSON válido.',
        });
      });
  });

  it('returns the contractual error for a body above the webhook limit', async () => {
    const body = JSON.stringify({ data: 'x'.repeat(64 * 1024) });

    await request(app.getHttpServer())
      .post('/webhooks/v1/occupancy')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(413)
      .expect(({ body: responseBody }) => {
        expect(responseBody).toEqual({
          code: 'payload_too_large',
          message: 'O corpo excede o limite permitido.',
        });
      });
  });

  it('normalizes parser errors for bodies above the parser limit', async () => {
    const body = JSON.stringify({ data: 'x'.repeat(101 * 1024) });

    await request(app.getHttpServer())
      .post('/webhooks/v1/occupancy')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(413)
      .expect(({ body: responseBody }) => {
        expect(responseBody).toEqual({
          code: 'payload_too_large',
          message: 'O corpo excede o limite permitido.',
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
