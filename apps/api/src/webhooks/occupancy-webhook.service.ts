import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OccupancyWebhookInboxEntity } from '../database/entities/occupancy-webhook-inbox.entity.js';
import { OccupancyWebhookInboxRepository } from '../database/repositories/occupancy-webhook-inbox.repository.js';
import type { OccupancySnapshot } from './occupancy-snapshot.types.js';
import { OccupancySnapshotValidationService } from './occupancy-snapshot-validation.service.js';
import { WebhookAuthenticationService } from './webhook-authentication.service.js';
import {
  WebhookRateLimitException,
  WebhookRateLimiterService,
} from './webhook-rate-limiter.service.js';
import { WebhookSourceConfigService } from './webhook-source-config.service.js';

const MAX_BODY_BYTES = 64 * 1024;

export interface OccupancyWebhookHeaders {
  contentType: string | undefined;
  source: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

@Injectable()
export class OccupancyWebhookService {
  constructor(
    private readonly authentication: WebhookAuthenticationService,
    private readonly sourceConfig: WebhookSourceConfigService,
    private readonly validation: OccupancySnapshotValidationService,
    private readonly rateLimiter: WebhookRateLimiterService,
    private readonly inbox: OccupancyWebhookInboxRepository,
  ) {}

  async receive(
    headers: OccupancyWebhookHeaders,
    rawBody: Buffer,
  ): Promise<void> {
    if (!isJsonContentType(headers.contentType)) {
      throw new UnsupportedMediaTypeException({
        code: 'unsupported_content_type',
        message: 'O Content-Type deve ser application/json.',
      });
    }
    if (rawBody.length > MAX_BODY_BYTES) {
      throw new HttpException(
        {
          code: 'payload_too_large',
          message: 'O corpo excede o limite permitido.',
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const sourceId = this.authentication.authenticate(
      headers.source,
      headers.timestamp,
      headers.signature,
      rawBody,
    );
    if (!this.rateLimiter.allow(sourceId)) {
      throw new WebhookRateLimitException(
        this.rateLimiter.retryAfterSeconds(sourceId),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException({
        code: 'malformed_json',
        message: 'O corpo não contém JSON válido.',
      });
    }
    const snapshot = this.validation.validate(parsed);
    const source = this.sourceConfig.find(sourceId);
    if (!source?.unitCnes.includes(snapshot.unitCnes)) {
      throw new ForbiddenException({
        code: 'unit_not_authorized',
        message: 'A fonte não está autorizada para esta unidade.',
      });
    }

    const rawBodyText = rawBody.toString('utf8');
    const existing = await this.inbox.findByEventId(snapshot.eventId);
    if (existing) {
      this.handleExisting(existing, sourceId, rawBodyText);
      return;
    }

    const entry = this.toEntity(sourceId, rawBodyText, snapshot);
    try {
      await this.inbox.insert(entry);
      return;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await this.inbox.findByEventId(snapshot.eventId);
      if (concurrent) {
        this.handleExisting(concurrent, sourceId, rawBodyText);
        return;
      }
      throw error;
    }
  }

  private handleExisting(
    existing: OccupancyWebhookInboxEntity,
    sourceId: string,
    rawBody: string,
  ): void {
    if (existing.sourceId !== sourceId || existing.rawBody !== rawBody) {
      throw new ConflictException({
        code: 'event_id_conflict',
        message: 'O eventId já está associado a outro evento.',
      });
    }
  }

  private toEntity(
    sourceId: string,
    rawBody: string,
    snapshot: OccupancySnapshot,
  ): OccupancyWebhookInboxEntity {
    const entry = new OccupancyWebhookInboxEntity();
    entry.eventId = snapshot.eventId;
    entry.sourceId = sourceId;
    entry.unitCnes = snapshot.unitCnes;
    entry.rawBody = rawBody;
    entry.payload = snapshot as unknown as Record<string, unknown>;
    entry.occurredAt = new Date(snapshot.occurredAt);
    entry.observedAt = new Date(snapshot.observedAt);
    entry.status = 'pending';
    entry.processedAt = null;
    entry.processingError = null;
    return entry;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError && error.driverError?.code === '23505'
  );
}

function isJsonContentType(contentType: string | undefined): boolean {
  return (
    contentType?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
  );
}
