import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { OccupancyWebhookInboxEntity } from '../entities/occupancy-webhook-inbox.entity.js';

@Injectable()
export class OccupancyWebhookInboxRepository {
  constructor(
    @InjectRepository(OccupancyWebhookInboxEntity)
    private readonly repository: Repository<OccupancyWebhookInboxEntity>,
  ) {}

  findByEventId(eventId: string): Promise<OccupancyWebhookInboxEntity | null> {
    return this.repository.findOneBy({ eventId });
  }

  async insert(
    entry: OccupancyWebhookInboxEntity,
  ): Promise<OccupancyWebhookInboxEntity> {
    await this.repository.insert(
      entry as unknown as QueryDeepPartialEntity<OccupancyWebhookInboxEntity>,
    );
    return entry;
  }
}
