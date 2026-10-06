import { MigrationInterface, QueryRunner, Table } from 'typeorm';

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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('unit_location_corrections');
  }
}
