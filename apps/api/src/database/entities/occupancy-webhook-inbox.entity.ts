import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'occupancy_webhook_inbox' })
@Index('idx_occupancy_webhook_inbox_source_received', [
  'sourceId',
  'receivedAt',
])
@Index('idx_occupancy_webhook_inbox_unit_occurred', ['unitCnes', 'occurredAt'])
export class OccupancyWebhookInboxEntity {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 26 })
  eventId!: string;

  @Column({ name: 'source_id', type: 'varchar', length: 128 })
  sourceId!: string;

  @Column({ name: 'unit_cnes', type: 'varchar', length: 7 })
  unitCnes!: string;

  @Column({ name: 'raw_body', type: 'text' })
  rawBody!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'observed_at', type: 'timestamptz' })
  observedAt!: Date;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError!: string | null;
}
