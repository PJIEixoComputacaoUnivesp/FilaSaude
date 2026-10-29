import { OccupancyRepository } from './occupancy.repository.js';

describe('OccupancyRepository', () => {
  it('processes a locked batch of pending events in one statement', async () => {
    const query = vi.fn().mockResolvedValue([{ processed: 3, applied: 2 }]);

    const result = await new OccupancyRepository({
      query,
    } as never).processPending(500);

    expect(result).toEqual({ processed: 3, applied: 2 });
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual([500, null]);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("pg_notify('filasaude_occupancy', unit_cnes)");
    expect(sql).toContain('ON CONFLICT (unit_cnes) DO UPDATE');
    // A late event never replaces a newer state.
    expect(sql).toMatch(
      /WHERE \(occupancy_current\.occurred_at, occupancy_current\.observed_at,\s+occupancy_current\.received_at, occupancy_current\.event_id\)\s+< \(EXCLUDED\.occurred_at/,
    );
  });

  it('restricts the batch to one event when isolating a failure', async () => {
    const query = vi.fn().mockResolvedValue([]);

    const result = await new OccupancyRepository({
      query,
    } as never).processPending(1, '01K5T2S6C4TZ1K9TR6F89A2M7X');

    expect(result).toEqual({ processed: 0, applied: 0 });
    expect(query.mock.calls[0][1]).toEqual([1, '01K5T2S6C4TZ1K9TR6F89A2M7X']);
  });

  it('records a bounded failure reason only for a pending event', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await new OccupancyRepository({ query } as never).markFailed(
      'EVENT',
      'x'.repeat(800),
    );

    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("status = 'pending'");
    expect(parameters[1]).toHaveLength(500);
  });

  it('returns the history oldest first, keeping the most recent points', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        event_id: 'B',
        categories: [],
        occurred_at: '2026-10-15T12:00:00Z',
        observed_at: '2026-10-15T12:00:01Z',
        received_at: '2026-10-15T12:00:02Z',
      },
      {
        event_id: 'A',
        categories: [],
        occurred_at: '2026-10-15T11:00:00Z',
        observed_at: '2026-10-15T11:00:01Z',
        received_at: '2026-10-15T11:00:02Z',
      },
    ]);
    const since = new Date('2026-10-14T12:00:00Z');

    const history = await new OccupancyRepository({
      query,
    } as never).findHistory('1234567', since);

    expect(history.map((point) => point.eventId)).toEqual(['A', 'B']);
    expect(history[0].occurredAt).toEqual(new Date('2026-10-15T11:00:00Z'));
    expect(query.mock.calls[0][0]).toContain("status = 'processed'");
    expect(query.mock.calls[0][1]).toEqual(['1234567', since, 2000]);
  });

  it('reads a bounded batch of rate samples anchored to the captured current state', async () => {
    const occurredAt = new Date('2026-10-29T12:00:00Z');
    const query = vi.fn().mockResolvedValue([
      {
        unit_cnes: '1234567',
        event_id: 'event-a',
        source_id: 'source-a',
        attendance: { inService: 2 },
        occurred_at: occurredAt,
        observed_at: occurredAt,
        received_at: occurredAt,
      },
    ]);
    const repository = new OccupancyRepository({ query } as never);
    expect(await repository.findWaitEstimateHistory([], 3_600_000)).toEqual(
      new Map(),
    );
    expect(query).not.toHaveBeenCalled();
    const result = await repository.findWaitEstimateHistory(
      [
        {
          unitCnes: '1234567',
          eventId: 'event-a',
          sourceId: 'source-a',
          attendance: { inService: 2 },
          occurredAt,
          observedAt: occurredAt,
          receivedAt: occurredAt,
        },
      ],
      3_600_000,
    );
    expect(result.get('1234567')).toEqual([
      {
        eventId: 'event-a',
        sourceId: 'source-a',
        attendance: { inService: 2 },
        occurredAt,
        observedAt: occurredAt,
        receivedAt: occurredAt,
      },
    ]);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain('CROSS JOIN LATERAL');
    expect(sql).toContain('LIMIT 121');
    expect(sql).toContain("status = 'processed'");
    expect(JSON.parse(parameters[0])).toMatchObject([
      { unit_cnes: '1234567', event_id: 'event-a' },
    ]);
    expect(parameters[1]).toBe(3_600_000);
  });

  it('only deletes processed events older than the cutoff', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const cutoff = new Date('2026-10-08T12:00:00Z');

    await new OccupancyRepository({ query } as never).deleteProcessedBefore(
      cutoff,
    );

    expect(query.mock.calls[0][0]).toContain("status = 'processed'");
    expect(query.mock.calls[0][1]).toEqual([cutoff]);
  });
});
