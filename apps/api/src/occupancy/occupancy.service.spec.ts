import { loadOccupancySettings } from './occupancy-settings.js';
import { OccupancyService } from './occupancy.service.js';

const now = new Date('2026-10-15T12:30:00Z');
const settings = loadOccupancySettings({});

function row(unitCnes: string, observedAt: string, occupied: number) {
  return {
    unitCnes,
    eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
    sourceId: 'occupancy-feed',
    categories: [{ code: 'observation', capacity: 20, occupied }],
    occurredAt: new Date(new Date(observedAt).getTime() - 1000),
    observedAt: new Date(observedAt),
    receivedAt: new Date(observedAt),
    updatedAt: new Date(observedAt),
  };
}

describe('OccupancyService', () => {
  it('returns the current state with its level, confirmation and simulation mark', async () => {
    const repository = {
      findCurrent: vi
        .fn()
        .mockResolvedValue([
          row('1234567', '2026-10-15T12:28:00Z', 18),
          row('7654321', '2026-10-15T12:00:00Z', 18),
        ]),
    };
    const service = new OccupancyService(repository as never, settings);

    const response = await service.findCurrent(now);

    expect(response.data).toEqual([
      expect.objectContaining({
        unitCnes: '1234567',
        percentage: 90,
        level: 'high',
        confirmation: 'recent',
        observedAt: '2026-10-15T12:28:00.000Z',
      }),
      expect.objectContaining({
        unitCnes: '7654321',
        percentage: 90,
        level: null,
        confirmation: 'stale',
      }),
    ]);
    expect(response.metadata).toMatchObject({
      simulated: true,
      generatedAt: now.toISOString(),
      staleAfterMinutes: 20,
      thresholds: { moderate: 0.6, high: 0.85 },
    });
    expect(response.metadata.source.description).toMatch(/sintéticos/);
  });

  it('reads the history of the configured period, each point as observed', async () => {
    const repository = {
      findCurrentByUnit: vi.fn().mockResolvedValue(null),
      findHistory: vi.fn().mockResolvedValue([
        {
          eventId: 'A',
          categories: [{ code: 'observation', capacity: 10, occupied: 3 }],
          occurredAt: new Date('2026-10-15T08:00:00Z'),
          observedAt: new Date('2026-10-15T08:00:01Z'),
          receivedAt: new Date('2026-10-15T08:00:02Z'),
        },
      ]),
    };
    const service = new OccupancyService(repository as never, settings);

    const response = await service.findHistory('1234567', now);

    expect(repository.findHistory).toHaveBeenCalledWith(
      '1234567',
      new Date('2026-10-14T12:30:00Z'),
    );
    expect(response.data).toEqual({
      unitCnes: '1234567',
      current: null,
      history: [
        expect.objectContaining({
          percentage: 30,
          level: 'low',
          occurredAt: '2026-10-15T08:00:00.000Z',
        }),
      ],
    });
    expect(response.metadata).toMatchObject({
      simulated: true,
      periodHours: 24,
    });
  });
});
