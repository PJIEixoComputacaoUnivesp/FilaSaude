import { compareWait, type WaitBaseline } from './wait-comparison.js';
import type { WaitEstimate } from './wait-estimate.js';

const now = new Date('2026-10-31T12:00:00.000Z');
const baseline: WaitBaseline = {
  typicalMinutes: 10,
  upperMinutes: 30,
  sampleCount: 96,
  windowStart: new Date('2026-10-30T12:00:00.000Z'),
  windowEnd: new Date('2026-10-31T11:45:00.000Z'),
};

function estimate(minutes: number): WaitEstimate {
  return {
    status: 'available',
    minutes,
    method: 'recent-start-rate',
    sampleCount: 30,
    started: 12,
    windowStart: '2026-10-31T11:00:00.000Z',
    windowEnd: '2026-10-31T12:00:00.000Z',
  };
}

describe('compareWait', () => {
  it('flags a reading above the percentile and past the margin', () => {
    expect(compareWait(estimate(31), baseline, now)).toEqual({
      status: 'above-usual',
      typicalMinutes: 10,
      upperMinutes: 30,
      sampleCount: 96,
      windowStart: '2026-10-30T12:00:00.000Z',
      windowEnd: '2026-10-31T11:45:00.000Z',
    });
  });

  it('keeps a reading at the percentile within the usual', () => {
    expect(compareWait(estimate(30), baseline, now).status).toBe('usual');
  });

  it('does not flag a small queue at a unit that is usually empty', () => {
    const empty = { ...baseline, typicalMinutes: 0, upperMinutes: 2 };

    expect(compareWait(estimate(14), empty, now).status).toBe('usual');
    expect(compareWait(estimate(15), empty, now).status).toBe('above-usual');
  });

  it('does not compare without enough readings', () => {
    expect(
      compareWait(estimate(90), { ...baseline, sampleCount: 47 }, now),
    ).toEqual({ status: 'unavailable' });
    expect(compareWait(estimate(90), undefined, now)).toEqual({
      status: 'unavailable',
    });
  });

  it('does not compare with a baseline that stopped being updated', () => {
    const old = {
      ...baseline,
      windowEnd: new Date('2026-10-31T10:59:00.000Z'),
    };

    expect(compareWait(estimate(90), old, now)).toEqual({
      status: 'unavailable',
    });
  });

  it('does not compare a missing estimate', () => {
    expect(
      compareWait(
        { status: 'unavailable', reason: 'no-throughput' },
        baseline,
        now,
      ),
    ).toEqual({ status: 'unavailable' });
  });
});
