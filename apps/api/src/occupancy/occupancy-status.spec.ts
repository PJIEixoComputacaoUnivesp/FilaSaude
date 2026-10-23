import {
  levelOf,
  summarizeOccupancy,
  summarizeUnitStatus,
  waitingLevelOf,
} from './occupancy-status.js';

const STALE_AFTER = 20 * 60_000;
const observedAt = new Date('2026-10-15T12:00:00Z');
const now = new Date('2026-10-15T12:05:00Z');

describe('summarizeOccupancy', () => {
  it('divides the total occupied by the total capacity of the informed categories', () => {
    const summary = summarizeOccupancy(
      [
        { code: 'observation', capacity: 20, occupied: 13 },
        { code: 'inpatient', capacity: 10, occupied: 5 },
      ],
      observedAt,
      now,
      STALE_AFTER,
    );

    expect(summary).toEqual({
      percentage: 60,
      level: 'moderate',
      confirmation: 'recent',
    });
  });

  it('reports "not informed" instead of zero when there is no capacity', () => {
    expect(
      summarizeOccupancy(
        [{ code: 'observation', capacity: 0, occupied: 0 }],
        observedAt,
        now,
        STALE_AFTER,
      ),
    ).toEqual({ percentage: null, level: null, confirmation: 'recent' });
    expect(summarizeOccupancy([], observedAt, now, STALE_AFTER).level).toBe(
      null,
    );
  });

  it('drops the level once the last confirmation is older than the limit', () => {
    const summary = summarizeOccupancy(
      [{ code: 'observation', capacity: 10, occupied: 9 }],
      observedAt,
      new Date(observedAt.getTime() + STALE_AFTER + 1),
      STALE_AFTER,
    );

    expect(summary).toEqual({
      percentage: 90,
      level: null,
      confirmation: 'stale',
    });
  });

  it('keeps the level exactly at the limit', () => {
    expect(
      summarizeOccupancy(
        [{ code: 'observation', capacity: 10, occupied: 1 }],
        observedAt,
        new Date(observedAt.getTime() + STALE_AFTER),
        STALE_AFTER,
      ).confirmation,
    ).toBe('recent');
  });
});

describe('levelOf', () => {
  it.each([
    [0, 'low'],
    [0.599, 'low'],
    [0.6, 'moderate'],
    [0.849, 'moderate'],
    [0.85, 'high'],
    [1, 'high'],
  ])('classifies %s as %s', (ratio, level) => {
    expect(levelOf(ratio)).toBe(level);
  });
});

describe('summarizeUnitStatus', () => {
  const beds = [{ code: 'observation', capacity: 10, occupied: 5 }];

  it('uses the highest level and names the indicators that set it', () => {
    const summary = summarizeUnitStatus(
      beds,
      { waiting: 12, serviceSlots: 4 },
      observedAt,
      now,
      STALE_AFTER,
    );

    expect(summary).toMatchObject({
      percentage: 50,
      level: 'high',
      indicators: { beds: 'low', waiting: 'high' },
      levelDrivers: ['waiting'],
    });
  });

  it('lists every indicator in a tie', () => {
    expect(
      summarizeUnitStatus(
        beds,
        { waiting: 0, serviceSlots: 2 },
        observedAt,
        now,
        STALE_AFTER,
      ).levelDrivers,
    ).toEqual(['beds', 'waiting']);
  });

  it('keeps the bed level when the flow is not informed or has no reference', () => {
    for (const attendance of [null, { waiting: 9 }, { serviceSlots: 2 }]) {
      expect(
        summarizeUnitStatus(beds, attendance, observedAt, now, STALE_AFTER),
      ).toMatchObject({
        level: 'low',
        indicators: { beds: 'low', waiting: null },
        levelDrivers: ['beds'],
      });
    }
  });

  it('uses the queue alone when no bed capacity is informed', () => {
    expect(
      summarizeUnitStatus(
        [],
        { waiting: 2, serviceSlots: 2 },
        observedAt,
        now,
        STALE_AFTER,
      ),
    ).toMatchObject({
      percentage: null,
      level: 'moderate',
      levelDrivers: ['waiting'],
    });
  });

  it('ignores completed attendances and drops every level when stale', () => {
    const completed = {
      count: 10_000,
      periodStart: '2026-10-15T00:00:00-03:00',
      periodEnd: '2026-10-16T00:00:00-03:00',
    };
    expect(
      summarizeUnitStatus(beds, { completed }, observedAt, now, STALE_AFTER)
        .level,
    ).toBe('low');
    expect(
      summarizeUnitStatus(
        beds,
        { waiting: 50, serviceSlots: 1 },
        observedAt,
        new Date(observedAt.getTime() + STALE_AFTER + 1),
        STALE_AFTER,
      ),
    ).toMatchObject({
      level: null,
      confirmation: 'stale',
      indicators: { beds: null, waiting: null },
      levelDrivers: [],
    });
  });
});

describe('waitingLevelOf', () => {
  it('classifies people waiting per active slot', () => {
    expect(waitingLevelOf(0.99)).toBe('low');
    expect(waitingLevelOf(1)).toBe('moderate');
    expect(waitingLevelOf(2.99)).toBe('moderate');
    expect(waitingLevelOf(3)).toBe('high');
  });
});
