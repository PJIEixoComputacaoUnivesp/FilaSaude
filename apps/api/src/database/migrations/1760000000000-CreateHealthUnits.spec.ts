import type { QueryRunner } from 'typeorm';
import { CreateHealthUnits1760000000000 } from './1760000000000-CreateHealthUnits.js';

describe('CreateHealthUnits1760000000000', () => {
  it('defines the health unit table required by the ADR', async () => {
    const createTable = vi.fn();
    const createIndex = vi.fn();
    const migration = new CreateHealthUnits1760000000000();
    const queryRunner = { createTable, createIndex } as never as QueryRunner;

    await migration.up(queryRunner);

    const table = createTable.mock.calls[0][0];
    expect(table.name).toBe('health_units');
    expect(table.findColumnByName('cnes_code')).toMatchObject({
      isPrimary: true,
      isNullable: false,
    });
    expect(table.findColumnByName('source_name')).toBeDefined();
    expect(table.findColumnByName('source_url')).toBeDefined();
    expect(table.findColumnByName('source_updated_at')).toBeDefined();
    expect(table.findColumnByName('ingested_at')).toBeDefined();
    expect(table.findColumnByName('is_active')).toMatchObject({
      default: true,
    });
    expect(createIndex).toHaveBeenCalledTimes(2);
  });

  it('drops the table when reverted', async () => {
    const dropTable = vi.fn();
    const migration = new CreateHealthUnits1760000000000();
    const queryRunner = { dropTable } as never as QueryRunner;

    await migration.down(queryRunner);

    expect(dropTable).toHaveBeenCalledWith('health_units');
  });
});
