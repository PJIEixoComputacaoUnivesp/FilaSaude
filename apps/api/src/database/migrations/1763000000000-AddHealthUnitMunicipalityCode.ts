import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddHealthUnitMunicipalityCode1763000000000 implements MigrationInterface {
  name = 'AddHealthUnitMunicipalityCode1763000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'health_units',
      new TableColumn({
        name: 'municipality_code',
        type: 'varchar',
        length: '6',
        isNullable: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('health_units', 'municipality_code');
  }
}
