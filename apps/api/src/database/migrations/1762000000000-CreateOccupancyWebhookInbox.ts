import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateOccupancyWebhookInbox1762000000000
  implements MigrationInterface
{
  name = 'CreateOccupancyWebhookInbox1762000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'occupancy_webhook_inbox',
        columns: [
          { name: 'event_id', type: 'varchar', length: '26', isPrimary: true },
          { name: 'source_id', type: 'varchar', length: '128' },
          { name: 'unit_cnes', type: 'varchar', length: '7' },
          { name: 'raw_body', type: 'text' },
          { name: 'payload', type: 'jsonb' },
          { name: 'occurred_at', type: 'timestamptz' },
          { name: 'observed_at', type: 'timestamptz' },
          { name: 'received_at', type: 'timestamptz', default: 'now()' },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'pending'",
          },
          { name: 'processed_at', type: 'timestamptz', isNullable: true },
          { name: 'processing_error', type: 'text', isNullable: true },
        ],
      }),
    );

    await queryRunner.createIndex(
      'occupancy_webhook_inbox',
      new TableIndex({
        name: 'idx_occupancy_webhook_inbox_source_received',
        columnNames: ['source_id', 'received_at'],
      }),
    );
    await queryRunner.createIndex(
      'occupancy_webhook_inbox',
      new TableIndex({
        name: 'idx_occupancy_webhook_inbox_unit_occurred',
        columnNames: ['unit_cnes', 'occurred_at'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('occupancy_webhook_inbox');
  }
}
