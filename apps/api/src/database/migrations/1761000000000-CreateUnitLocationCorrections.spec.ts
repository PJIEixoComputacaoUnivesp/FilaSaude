import type { QueryRunner } from 'typeorm';
import { CreateUnitLocationCorrections1761000000000 } from './1761000000000-CreateUnitLocationCorrections.js';

describe('CreateUnitLocationCorrections1761000000000', () => {
  it('defines the corrections table with the anchor to the CNES state', async () => {
    const createTable = vi.fn();
    const migration = new CreateUnitLocationCorrections1761000000000();

    await migration.up({ createTable } as never as QueryRunner);

    const table = createTable.mock.calls[0][0];
    expect(table.name).toBe('unit_location_corrections');
    expect(table.findColumnByName('cnes_code')).toMatchObject({
      isPrimary: true,
      isNullable: false,
    });
    for (const name of ['latitude', 'longitude', 'verified_by', 'method']) {
      expect(table.findColumnByName(name)).toMatchObject({ isNullable: false });
    }
    expect(table.findColumnByName('corrected_at')).toMatchObject({
      default: 'now()',
    });
    expect(table.findColumnByName('anchor_municipality_code')).toMatchObject({
      isNullable: false,
    });
    for (const name of [
      'anchor_street',
      'anchor_number',
      'anchor_latitude',
      'anchor_longitude',
    ]) {
      expect(table.findColumnByName(name)).toMatchObject({ isNullable: true });
    }
  });

  it('drops the table when reverted', async () => {
    const dropTable = vi.fn();

    await new CreateUnitLocationCorrections1761000000000().down({
      dropTable,
    } as never as QueryRunner);

    expect(dropTable).toHaveBeenCalledWith('unit_location_corrections');
  });
});
