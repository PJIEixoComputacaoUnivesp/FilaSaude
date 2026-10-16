import type { QueryRunner } from 'typeorm';
import { CreateSimulationControl1764000000000 } from './1764000000000-CreateSimulationControl.js';

describe('CreateSimulationControl1764000000000', () => {
  it('defines a single-row control table', async () => {
    const createTable = vi.fn();

    await new CreateSimulationControl1764000000000().up({
      createTable,
    } as never as QueryRunner);

    const table = createTable.mock.calls[0][0];
    expect(table.name).toBe('simulation_control');
    expect(table.findColumnByName('id')).toMatchObject({ isPrimary: true });
    for (const name of ['scenario', 'changed_at', 'expires_at']) {
      expect(table.findColumnByName(name)).toMatchObject({ isNullable: false });
    }
    expect(table.checks[0].expression).toBe('id = 1');
  });

  it('drops the table when reverted', async () => {
    const dropTable = vi.fn();

    await new CreateSimulationControl1764000000000().down({
      dropTable,
    } as never as QueryRunner);

    expect(dropTable).toHaveBeenCalledWith('simulation_control');
  });
});
