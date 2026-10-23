import { TableColumn } from 'typeorm';
import { AddOccupancyCurrentAttendance1764000000000 } from './1764000000000-AddOccupancyCurrentAttendance.js';

describe('AddOccupancyCurrentAttendance1764000000000', () => {
  it('adds a nullable attendance column, so existing rows read as not informed', async () => {
    const addColumn = vi.fn();
    const migration = new AddOccupancyCurrentAttendance1764000000000();

    await migration.up({ addColumn } as never);

    expect(addColumn).toHaveBeenCalledWith(
      'occupancy_current',
      expect.any(TableColumn),
    );
    const column = addColumn.mock.calls[0]![1] as TableColumn;
    expect(column).toMatchObject({
      name: 'attendance',
      type: 'jsonb',
      isNullable: true,
    });
  });

  it('removes the attendance column on rollback', async () => {
    const dropColumn = vi.fn();
    const migration = new AddOccupancyCurrentAttendance1764000000000();

    await migration.down({ dropColumn } as never);

    expect(dropColumn).toHaveBeenCalledWith('occupancy_current', 'attendance');
  });
});
