import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * The scenario the site asked the occupancy simulator to play. One row: the
 * check keeps it a singleton, so every API instance and the simulator read
 * the same choice.
 */
export class CreateSimulationControl1764000000000 implements MigrationInterface {
  name = 'CreateSimulationControl1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'simulation_control',
        columns: [
          { name: 'id', type: 'smallint', isPrimary: true, default: 1 },
          { name: 'scenario', type: 'varchar', length: '32' },
          { name: 'changed_at', type: 'timestamptz' },
          { name: 'expires_at', type: 'timestamptz' },
        ],
        checks: [
          { name: 'chk_simulation_control_singleton', expression: 'id = 1' },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('simulation_control');
  }
}
