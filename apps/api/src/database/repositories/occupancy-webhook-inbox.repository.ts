import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  insert(
    entry: OccupancyWebhookInboxEntity,
  ): Promise<OccupancyWebhookInboxEntity> {
    return this.repository.save(entry);
  }
}
