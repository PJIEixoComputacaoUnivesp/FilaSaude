import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUnitLocationCorrections1761000000000 implements MigrationInterface {
  name = 'CreateUnitLocationCorrections1761000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'unit_location_corrections',
        columns: [
          { name: 'cnes_code', type: 'varchar', length: '7', isPrimary: true },
          { name: 'latitude', type: 'numeric', precision: 9, scale: 6 },
          { name: 'longitude', type: 'numeric', precision: 9, scale: 6 },
          { name: 'verified_by', type: 'varchar', length: '80' },
          { name: 'method', type: 'text' },
          { name: 'corrected_at', type: 'timestamptz', default: 'now()' },
          { name: 'anchor_municipality_code', type: 'char', length: '6' },
          {
            name: 'anchor_street',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'anchor_number',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'anchor_latitude',
            type: 'numeric',
            precision: 9,
            scale: 6,
            isNullable: true,
          },
          {
            name: 'anchor_longitude',
            type: 'numeric',
            precision: 9,
            scale: 6,
            isNullable: true,
          },
        ],
      }),
    );

    // Append-only history of every change to a correction.
    await queryRunner.createTable(
      new Table({
        name: 'unit_location_correction_events',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'identity',
            generatedIdentity: 'ALWAYS',
          },
          { name: 'cnes_code', type: 'varchar', length: '7' },
          { name: 'action', type: 'varchar', length: '8' },
          { name: 'actor', type: 'varchar', length: '39' },
          {
            name: 'occurred_at',
            type: 'timestamptz',
            default: 'clock_timestamp()',
          },
          { name: 'method', type: 'text', isNullable: true },
          {
            name: 'previous_latitude',
            type: 'numeric',
            precision: 9,
            scale: 6,
            isNullable: true,
          },
          {
            name: 'previous_longitude',
            type: 'numeric',
            precision: 9,
            scale: 6,
            isNullable: true,
          },
          {
            name: 'new_latitude',
            type: 'numeric',
            precision: 9,
            scale: 6,
            isNullable: true,
          },
          {
            name: 'new_longitude',
            type: 'numeric',
            precision: 9,
            scale: 6,
            isNullable: true,
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'unit_location_correction_events',
      new TableIndex({
        name: 'idx_unit_location_correction_events_cnes',
        columnNames: ['cnes_code', 'occurred_at'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('unit_location_correction_events');
    await queryRunner.dropTable('unit_location_corrections');
  }
}
