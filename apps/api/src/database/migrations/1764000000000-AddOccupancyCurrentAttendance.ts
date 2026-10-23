import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Attendance flow of the latest snapshot (occupancy.snapshot.v2). NULL means
 * the source did not inform it, which v1 snapshots never do.
 */
export class AddOccupancyCurrentAttendance1764000000000 implements MigrationInterface {
  name = 'AddOccupancyCurrentAttendance1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'occupancy_current',
      new TableColumn({
        name: 'attendance',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('occupancy_current', 'attendance');
  }
}
