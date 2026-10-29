import { estimateWait, type WaitEstimateSample } from './wait-estimate.js';

const base = Date.parse('2026-10-29T12:00:00Z');
const staleAfterMs = 20 * 60_000;
function sample(
  minute: number,
  count: number,
  inService = 2,
): WaitEstimateSample {
  return {
    eventId: `event-${minute}`,
    sourceId: 'source-a',
    attendance: {
      waiting: 6,
      inService,
      completed: {
        count,
        periodStart: '2026-10-29T03:00:00Z',
        periodEnd: '2026-10-30T03:00:00Z',
      },
    },
    occurredAt: new Date(base + minute * 60_000),
    observedAt: new Date(base + minute * 60_000),
    receivedAt: new Date(base + minute * 60_000),
  };
}
const history = () => [sample(0, 10), sample(10, 13), sample(20, 16)];
function calculate(points = history()) {
  const current = points.at(-1)!;
  return estimateWait(current, points, current.observedAt, staleAfterMs);
}

describe('estimateWait', () => {
  it('estimates from received starts per minute without simulator parameters or beds', () => {
    expect(calculate()).toEqual({
      status: 'available',
      minutes: 20,
      method: 'recent-start-rate',
      sampleCount: 3,
      started: 6,
      windowStart: '2026-10-29T12:00:00.000Z',
      windowEnd: '2026-10-29T12:20:00.000Z',
    });
  });

  it('includes the change in in-service stock when inferring starts', () => {
    expect(
      calculate([sample(0, 10), sample(10, 13), sample(20, 16, 4)]),
    ).toMatchObject({ status: 'available', minutes: 15, started: 8 });
  });

  it('accepts confirmed zero waiting only with a valid recent rate', () => {
    const points = history();
    points.at(-1)!.attendance!.waiting = 0;
    expect(calculate(points)).toMatchObject({
      status: 'available',
      minutes: 0,
    });
  });

  it('needs at least three readings over fifteen minutes', () => {
    expect(calculate([sample(0, 0), sample(5, 2), sample(10, 4)])).toEqual({
      status: 'unavailable',
      reason: 'insufficient-history',
    });
    expect(calculate([sample(0, 0), sample(20, 5)]).status).toBe('unavailable');
  });

  it('does not divide by zero or claim zero delay without throughput', () => {
    expect(calculate([sample(0, 10), sample(10, 10), sample(20, 10)])).toEqual({
      status: 'unavailable',
      reason: 'no-throughput',
    });
  });

  it.each(['waiting', 'inService', 'completed'] as const)(
    'requires %s',
    (field) => {
      const points = history();
      delete points.at(-1)!.attendance![field];
      expect(calculate(points)).toEqual({
        status: 'unavailable',
        reason: 'missing-data',
      });
    },
  );

  it('does not expose a rate beyond the safe integer range', () => {
    const points = history();
    points.at(-1)!.attendance!.completed!.count = Number.MAX_SAFE_INTEGER;
    points.at(-1)!.attendance!.inService = Number.MAX_SAFE_INTEGER;
    expect(calculate(points)).toEqual({
      status: 'unavailable',
      reason: 'missing-data',
    });
  });

  it('drops the estimate when confirmation expires', () => {
    const current = history().at(-1)!;
    expect(
      estimateWait(
        current,
        history(),
        new Date(current.observedAt.getTime() + staleAfterMs + 1),
        staleAfterMs,
      ),
    ).toEqual({ status: 'unavailable', reason: 'stale' });
  });

  it.each(['source', 'period', 'counter', 'missing', 'gap', 'negative-starts'])(
    'does not bridge a %s discontinuity',
    (mode) => {
      const points = history();
      const middle = points[1];
      if (mode === 'source') middle.sourceId = 'other-source';
      if (mode === 'period')
        middle.attendance!.completed!.periodStart = '2026-10-28T03:00:00Z';
      if (mode === 'counter') middle.attendance!.completed!.count = 1;
      if (mode === 'missing') middle.attendance = null;
      if (mode === 'gap') middle.occurredAt = new Date(base + 5 * 60_000);
      if (mode === 'negative-starts') middle.attendance!.inService = 10;
      expect(calculate(points)).toEqual({
        status: 'unavailable',
        reason: 'insufficient-history',
      });
    },
  );

  it('resumes after a reset once the new segment has enough history', () => {
    const points = [
      sample(0, 500),
      sample(10, 0),
      sample(20, 3),
      sample(30, 6),
    ];
    expect(calculate(points)).toMatchObject({
      status: 'available',
      minutes: 20,
      sampleCount: 3,
    });
  });

  it('does not let duplicates or same-time corrections inflate the sample count', () => {
    const points = history();
    const correction = {
      ...points[1],
      eventId: 'correction',
      receivedAt: new Date(base + 10 * 60_000 + 1),
    };
    expect(
      calculate([points[0], points[1], points[1], correction, points[2]]),
    ).toMatchObject({ status: 'available', sampleCount: 3, started: 6 });
  });

  it('excludes events outside the hour and future events', () => {
    const points = history();
    expect(
      estimateWait(
        points[2],
        [sample(-70, 0), ...points, sample(30, 1000)],
        points[2].observedAt,
        staleAfterMs,
      ),
    ).toMatchObject({ status: 'available', minutes: 20, sampleCount: 3 });
  });
});
