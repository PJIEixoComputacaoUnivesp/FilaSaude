import { SimulationControlService } from './simulation-control.service.js';

const now = new Date('2026-10-15T12:00:00Z');

function control(scenario: string, changedAt: string, expiresAt: string) {
  return {
    id: 1,
    scenario,
    changedAt: new Date(changedAt),
    expiresAt: new Date(expiresAt),
  };
}

describe('SimulationControlService', () => {
  it('plays the default scenario when nothing was chosen', async () => {
    const service = new SimulationControlService({
      find: vi.fn().mockResolvedValue(null),
    } as never);

    const { data, metadata } = await service.find(now);

    expect(data).toMatchObject({
      scenario: 'showcase',
      changedAt: null,
      expiresAt: null,
      nextChangeAt: null,
    });
    expect(data.scenarios.map(({ id }) => id)).toContain('surge');
    expect(metadata.simulated).toBe(true);
  });

  it('returns to the default once the choice expires', async () => {
    const service = new SimulationControlService({
      find: vi
        .fn()
        .mockResolvedValue(
          control('surge', '2026-10-15T11:40:00Z', '2026-10-15T11:55:00Z'),
        ),
    } as never);

    expect((await service.find(now)).data.scenario).toBe('showcase');
  });

  it('records a change for fifteen minutes', async () => {
    const change = vi
      .fn()
      .mockImplementation((scenario, changedAt, expiresAt) =>
        Promise.resolve({ id: 1, scenario, changedAt, expiresAt }),
      );
    const service = new SimulationControlService({ change } as never);

    const result = await service.change('outage', now);

    expect(change).toHaveBeenCalledWith(
      'outage',
      now,
      new Date('2026-10-15T12:15:00Z'),
      new Date('2026-10-15T11:59:45Z'),
    );
    expect(result).toMatchObject({
      status: 'changed',
      response: {
        data: {
          scenario: 'outage',
          expiresAt: '2026-10-15T12:15:00.000Z',
          nextChangeAt: '2026-10-15T12:00:15.000Z',
        },
      },
    });
  });

  it('refuses a change during the cooldown and says when to retry', async () => {
    const service = new SimulationControlService({
      change: vi.fn().mockResolvedValue(null),
      find: vi
        .fn()
        .mockResolvedValue(
          control('surge', '2026-10-15T11:59:55Z', '2026-10-15T12:14:55Z'),
        ),
    } as never);

    await expect(service.change('normal', now)).resolves.toEqual({
      status: 'cooldown',
      retryAfterSeconds: 10,
    });
  });
});
