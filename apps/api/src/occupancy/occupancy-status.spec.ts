import { levelOf, summarizeOccupancy } from './occupancy-status.js';

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
