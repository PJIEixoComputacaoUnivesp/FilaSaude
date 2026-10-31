import { Table } from 'typeorm';
import { CreateOccupancyWaitTables1765000000000 } from './1765000000000-CreateOccupancyWaitTables.js';

function runner() {
  return {
    createTable: vi.fn(),
    createIndex: vi.fn(),
    dropTable: vi.fn(),
    query: vi.fn(),
  };
}

describe('CreateOccupancyWaitTables1765000000000', () => {
  it('creates the three tables and indexes the samples by unit', async () => {
    const queryRunner = runner();

    await new CreateOccupancyWaitTables1765000000000().up(queryRunner as never);

    expect(
      queryRunner.createTable.mock.calls.map(
        ([table]) => (table as Table).name,
      ),
    ).toEqual([
      'occupancy_flow_sample',
      'occupancy_wait_sample',
      'occupancy_wait_baseline',
    ]);
    expect(queryRunner.createIndex).toHaveBeenCalledWith(
      'occupancy_flow_sample',
      expect.objectContaining({ columnNames: ['unit_cnes', 'occurred_at'] }),
    );
  });

  it('backfills the recent window through the unit index', async () => {
    const queryRunner = runner();

    await new CreateOccupancyWaitTables1765000000000().up(queryRunner as never);

    const sql = queryRunner.query.mock.calls[0]![0] as string;
    expect(sql).toContain('CROSS JOIN LATERAL');
    expect(sql).toContain("status = 'processed'");
    expect(sql).toContain("interval '90 minutes'");
  });

  it('drops the three tables on rollback', async () => {
    const queryRunner = runner();

    await new CreateOccupancyWaitTables1765000000000().down(
      queryRunner as never,
    );

    expect(queryRunner.dropTable).toHaveBeenCalledTimes(3);
  });
});
