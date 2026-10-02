import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateHealthUnits1760000000000 implements MigrationInterface {
  name = 'CreateHealthUnits1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'health_units',
        columns: [
          { name: 'cnes_code', type: 'varchar', length: '7', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'unit_type', type: 'varchar', length: '64' },
          { name: 'street', type: 'varchar', length: '255', isNullable: true },
          { name: 'number', type: 'varchar', length: '32', isNullable: true },
          { name: 'district', type: 'varchar', length: '128', isNullable: true },
          { name: 'postal_code', type: 'varchar', length: '8', isNullable: true },
          { name: 'city', type: 'varchar', length: '128' },
          { name: 'state', type: 'char', length: '2' },
          { name: 'latitude', type: 'numeric', precision: 9, scale: 6, isNullable: true },
          { name: 'longitude', type: 'numeric', precision: 9, scale: 6, isNullable: true },
          { name: 'service_hours', type: 'text', isNullable: true },
          { name: 'source_name', type: 'varchar', length: '255' },
          { name: 'source_url', type: 'text' },
          { name: 'source_updated_at', type: 'date' },
          { name: 'ingested_at', type: 'timestamptz' },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
    );

    await queryRunner.createIndex(
      'health_units',
      new TableIndex({ name: 'idx_health_units_state', columnNames: ['state'] }),
    );
    await queryRunner.createIndex(
      'health_units',
      new TableIndex({ name: 'idx_health_units_city', columnNames: ['city'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('health_units');
  }
}
