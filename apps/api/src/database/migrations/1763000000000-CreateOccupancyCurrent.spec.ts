import type { QueryRunner } from 'typeorm';
import { CreateOccupancyCurrent1763000000000 } from './1763000000000-CreateOccupancyCurrent.js';

describe('CreateOccupancyCurrent1763000000000', () => {
  it('defines one current row per unit and indexes the pending events', async () => {
    const createTable = vi.fn();
    const createIndex = vi.fn();

    await new CreateOccupancyCurrent1763000000000().up({
      createTable,
      createIndex,
    } as never as QueryRunner);

    const table = createTable.mock.calls[0][0];
    expect(table.name).toBe('occupancy_current');
    expect(table.findColumnByName('unit_cnes')).toMatchObject({
      isPrimary: true,
      length: '7',
    });
    for (const name of [
      'event_id',
      'source_id',
      'categories',
      'occurred_at',
      'observed_at',
      'received_at',
    ]) {
      expect(table.findColumnByName(name)).toMatchObject({ isNullable: false });
    }
    expect(createIndex).toHaveBeenCalledWith(
      'occupancy_webhook_inbox',
      expect.objectContaining({
        name: 'idx_occupancy_webhook_inbox_pending',
        columnNames: ['received_at', 'event_id'],
        where: "status = 'pending'",
      }),
    );
  });

  it('drops the index and the table when reverted', async () => {
    const dropIndex = vi.fn();
    const dropTable = vi.fn();

    await new CreateOccupancyCurrent1763000000000().down({
      dropIndex,
      dropTable,
    } as never as QueryRunner);

    expect(dropIndex).toHaveBeenCalledWith(
      'occupancy_webhook_inbox',
      'idx_occupancy_webhook_inbox_pending',
    );
    expect(dropTable).toHaveBeenCalledWith('occupancy_current');
  });
});
