import { SimulationControlRepository } from './simulation-control.repository.js';

describe('SimulationControlRepository', () => {
  it('changes the scenario only when the cooldown has passed, in one statement', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 1,
        scenario: 'surge',
        changed_at: '2026-10-15T12:00:00Z',
        expires_at: '2026-10-15T12:15:00Z',
      },
    ]);
    const now = new Date('2026-10-15T12:00:00Z');
    const expiresAt = new Date('2026-10-15T12:15:00Z');
    const changedBefore = new Date('2026-10-15T11:59:45Z');

    const result = await new SimulationControlRepository({
      query,
    } as never).change('surge', now, expiresAt, changedBefore);

    expect(result).toMatchObject({
      scenario: 'surge',
      changedAt: now,
      expiresAt,
    });
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(sql).toContain('WHERE simulation_control.changed_at <= $4');
    expect(parameters).toEqual(['surge', now, expiresAt, changedBefore]);
  });

  it('reports a running cooldown as null', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await expect(
      new SimulationControlRepository({ query } as never).change(
        'normal',
        new Date(),
        new Date(),
        new Date(),
      ),
    ).resolves.toBeNull();
  });
});
