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
      findWaitEstimateHistory: vi.fn().mockResolvedValue(new Map()),
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
      findWaitEstimateHistory: vi.fn().mockResolvedValue(new Map()),
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

it('calculates the same estimate in national, delta and detail responses', async () => {
  const instant = new Date('2026-10-15T12:20:00Z');
  const points = [0, 10, 20].map((minute, index) => ({
    ...row(
      '1234567',
      new Date(instant.getTime() - (20 - minute) * 60_000).toISOString(),
      10,
    ),
    eventId: `event-${index}`,
    attendance: {
      waiting: 6,
      inService: 2,
      serviceSlots: 2,
      installedServiceSlots: 4,
      services: ['nursing'],
      completed: {
        count: index * 3,
        periodStart: '2026-10-15T03:00:00Z',
        periodEnd: '2026-10-16T03:00:00Z',
      },
    },
  }));
  const current = points.at(-1)!;
  const repository = {
    findCurrent: vi.fn().mockResolvedValue([current]),
    findCurrentForUnits: vi.fn().mockResolvedValue([current]),
    findCurrentByUnit: vi.fn().mockResolvedValue(current),
    findHistory: vi.fn().mockResolvedValue(points),
    findWaitEstimateHistory: vi
      .fn()
      .mockResolvedValue(new Map([['1234567', points]])),
  };
  const service = new OccupancyService(repository as never, settings);
  const responses = await Promise.all([
    service.findCurrent(instant),
    service.findCurrentForUnits(['1234567'], instant),
    service.findHistory('1234567', instant),
  ]);
  expect(responses[0].data[0].waitEstimate).toMatchObject({
    status: 'available',
    minutes: 20,
  });
  expect(responses[1].data[0]).toEqual(responses[0].data[0]);
  expect(responses[2].data.current).toEqual(responses[0].data[0]);
  expect(responses[0].data[0].attendance).toEqual(current.attendance);
});
