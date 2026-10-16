import { TableColumn } from 'typeorm';
import { AddHealthUnitMunicipalityCode1763000000000 } from './1763000000000-AddHealthUnitMunicipalityCode.js';

describe('AddHealthUnitMunicipalityCode1763000000000', () => {
  it('adds the municipality code without invalidating legacy empty rows', async () => {
    const addColumn = vi.fn();
    const migration = new AddHealthUnitMunicipalityCode1763000000000();

    await migration.up({ addColumn } as never);

    expect(addColumn).toHaveBeenCalledWith(
      'health_units',
      expect.any(TableColumn),
    );
    const column = addColumn.mock.calls[0]![1] as TableColumn;
    expect(column).toMatchObject({
      name: 'municipality_code',
      type: 'varchar',
      length: '6',
      isNullable: true,
    });
  });

  it('removes the municipality code on rollback', async () => {
    const dropColumn = vi.fn();
    const migration = new AddHealthUnitMunicipalityCode1763000000000();

    await migration.down({ dropColumn } as never);

    expect(dropColumn).toHaveBeenCalledWith(
      'health_units',
      'municipality_code',
    );
  });
});
