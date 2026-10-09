import type { QueryRunner } from 'typeorm';
import { CreateOccupancyWebhookInbox1762000000000 } from './1762000000000-CreateOccupancyWebhookInbox.js';

describe('CreateOccupancyWebhookInbox1762000000000', () => {
  it('defines the idempotent inbox table and its indexes', async () => {
    const createTable = vi.fn();
    const createIndex = vi.fn();
    const migration = new CreateOccupancyWebhookInbox1762000000000();

    await migration.up({ createTable, createIndex } as never as QueryRunner);

    const table = createTable.mock.calls[0][0];
    expect(table.name).toBe('occupancy_webhook_inbox');
    expect(table.findColumnByName('event_id')).toMatchObject({
      isPrimary: true,
      length: '26',
    });
    for (const name of [
      'source_id',
      'unit_cnes',
      'raw_body',
      'payload',
      'occurred_at',
      'observed_at',
    ]) {
      expect(table.findColumnByName(name)).toMatchObject({ isNullable: false });
    }
    expect(table.findColumnByName('received_at')).toMatchObject({
      default: 'now()',
    });
    expect(table.findColumnByName('status')).toMatchObject({
      default: "'pending'",
    });
    expect(createIndex).toHaveBeenCalledWith(
      'occupancy_webhook_inbox',
      expect.objectContaining({
        columnNames: ['source_id', 'received_at'],
      }),
    );
    expect(createIndex).toHaveBeenCalledWith(
      'occupancy_webhook_inbox',
      expect.objectContaining({
        columnNames: ['unit_cnes', 'occurred_at'],
      }),
    );
  });

  it('drops the inbox table when reverted', async () => {
    const dropTable = vi.fn();

    await new CreateOccupancyWebhookInbox1762000000000().down({
      dropTable,
    } as never as QueryRunner);

    expect(dropTable).toHaveBeenCalledWith('occupancy_webhook_inbox');
  });
});
