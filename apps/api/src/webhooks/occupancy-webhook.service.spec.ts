import {
  ConflictException,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OccupancyWebhookInboxEntity } from '../database/entities/occupancy-webhook-inbox.entity.js';
import type { OccupancyWebhookInboxRepository } from '../database/repositories/occupancy-webhook-inbox.repository.js';
import { OccupancySnapshotValidationService } from './occupancy-snapshot-validation.service.js';
import { OccupancyWebhookService } from './occupancy-webhook.service.js';
import type { WebhookAuthenticationService } from './webhook-authentication.service.js';
import { WebhookRateLimiterService } from './webhook-rate-limiter.service.js';
import type { WebhookSourceConfigService } from './webhook-source-config.service.js';

describe('OccupancyWebhookService', () => {
  const snapshot = {
    eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
    type: 'occupancy.snapshot.v1',
    unitCnes: '1234567',
    occurredAt: '2026-09-25T14:30:00-03:00',
    observedAt: '2026-09-25T14:30:05-03:00',
    categories: [{ code: 'observation', capacity: 20, occupied: 13 }],
  };
  const rawBody = Buffer.from(JSON.stringify(snapshot));
  const authentication = {
    authenticate: vi.fn().mockReturnValue('academic-simulator'),
  } as unknown as WebhookAuthenticationService;
  const sourceConfig = {
    find: vi.fn().mockReturnValue({
      secret: 'test-secret',
      unitCnes: ['1234567'],
    }),
  } as unknown as WebhookSourceConfigService;
  const repository = {
    findByEventId: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(new OccupancyWebhookInboxEntity()),
  } as unknown as OccupancyWebhookInboxRepository;
  let service: OccupancyWebhookService;
  const headers = {
    contentType: 'application/json',
    source: 'academic-simulator',
    timestamp: '1790000000',
    signature: 'sha256=' + '0'.repeat(64),
  };

  beforeEach(() => {
    vi.mocked(authentication.authenticate)
      .mockReset()
      .mockReturnValue('academic-simulator');
    vi.mocked(sourceConfig.find)
      .mockReset()
      .mockReturnValue({
        secret: 'test-secret',
        unitCnes: ['1234567'],
      });
    vi.mocked(repository.findByEventId).mockReset().mockResolvedValue(null);
    vi.mocked(repository.insert)
      .mockReset()
      .mockResolvedValue(new OccupancyWebhookInboxEntity());
    service = new OccupancyWebhookService(
      authentication,
      sourceConfig,
      new OccupancySnapshotValidationService(),
      new WebhookRateLimiterService(),
      repository,
    );
  });

  it('persists a valid event before returning success', async () => {
    await expect(service.receive(headers, rawBody)).resolves.toBeUndefined();
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: snapshot.eventId }),
    );
  });

  it('returns success for an identical duplicate', async () => {
    const existing = new OccupancyWebhookInboxEntity();
    existing.eventId = snapshot.eventId;
    existing.sourceId = 'academic-simulator';
    existing.rawBody = rawBody.toString('utf8');
    vi.mocked(repository.findByEventId).mockResolvedValue(existing);

    await expect(service.receive(headers, rawBody)).resolves.toBeUndefined();
  });

  it('rejects a duplicate event with a different body', async () => {
    const existing = new OccupancyWebhookInboxEntity();
    existing.eventId = snapshot.eventId;
    existing.sourceId = 'academic-simulator';
    existing.rawBody = '{"different":true}';
    vi.mocked(repository.findByEventId).mockResolvedValue(existing);

    await expect(service.receive(headers, rawBody)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects a source that is not authorized for the unit', async () => {
    vi.mocked(sourceConfig.find).mockReturnValue({
      secret: 'test-secret',
      unitCnes: ['7654321'],
    });

    await expect(service.receive(headers, rawBody)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects unsupported content types', async () => {
    await expect(
      service.receive({ ...headers, contentType: 'text/plain' }, rawBody),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects bodies above the webhook limit', async () => {
    await expect(
      service.receive(headers, Buffer.alloc(64 * 1024 + 1)),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('rejects the request that exceeds the source rate limit', async () => {
    for (let index = 0; index < 60; index += 1) {
      await service.receive(headers, rawBody);
    }

    await expect(service.receive(headers, rawBody)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('handles a concurrent event conflict between different sources', async () => {
    const existing = new OccupancyWebhookInboxEntity();
    existing.eventId = snapshot.eventId;
    existing.sourceId = 'another-source';
    existing.rawBody = rawBody.toString('utf8');
    vi.mocked(repository.insert).mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('unique violation'), { code: '23505' }),
      ),
    );
    vi.mocked(repository.findByEventId)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    await expect(service.receive(headers, rawBody)).rejects.toThrow(
      ConflictException,
    );
  });
});
