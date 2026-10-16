import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Current occupancy projection, one row per unit, written by the inbox
 * processor. The history stays in the inbox itself (one row per accepted
 * snapshot), so the partial index lets the processor find pending events
 * without scanning the processed ones.
 */
export class CreateOccupancyCurrent1763000000000 implements MigrationInterface {
  name = 'CreateOccupancyCurrent1763000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'occupancy_current',
        columns: [
          { name: 'unit_cnes', type: 'varchar', length: '7', isPrimary: true },
          { name: 'event_id', type: 'varchar', length: '26' },
          { name: 'source_id', type: 'varchar', length: '128' },
          { name: 'categories', type: 'jsonb' },
          { name: 'occurred_at', type: 'timestamptz' },
          { name: 'observed_at', type: 'timestamptz' },
          { name: 'received_at', type: 'timestamptz' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );

    await queryRunner.createIndex(
      'occupancy_webhook_inbox',
      new TableIndex({
        name: 'idx_occupancy_webhook_inbox_pending',
        columnNames: ['received_at', 'event_id'],
        where: "status = 'pending'",
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'occupancy_webhook_inbox',
      'idx_occupancy_webhook_inbox_pending',
    );
    await queryRunner.dropTable('occupancy_current');
  }
}
