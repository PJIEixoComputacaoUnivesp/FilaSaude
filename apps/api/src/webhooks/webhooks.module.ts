import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OccupancyWebhookInboxEntity } from '../database/entities/occupancy-webhook-inbox.entity.js';
import { OccupancyWebhookInboxRepository } from '../database/repositories/occupancy-webhook-inbox.repository.js';
import { OccupancySnapshotValidationService } from './occupancy-snapshot-validation.service.js';
import { OccupancyWebhookController } from './occupancy-webhook.controller.js';
import { OccupancyWebhookService } from './occupancy-webhook.service.js';
import { WebhookAuthenticationService } from './webhook-authentication.service.js';
import { WebhookRateLimiterService } from './webhook-rate-limiter.service.js';
import { WebhookSourceConfigService } from './webhook-source-config.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([OccupancyWebhookInboxEntity])],
  controllers: [OccupancyWebhookController],
  providers: [
    OccupancyWebhookInboxRepository,
    OccupancySnapshotValidationService,
    OccupancyWebhookService,
    WebhookAuthenticationService,
    WebhookRateLimiterService,
    WebhookSourceConfigService,
  ],
})
export class WebhooksModule {}
