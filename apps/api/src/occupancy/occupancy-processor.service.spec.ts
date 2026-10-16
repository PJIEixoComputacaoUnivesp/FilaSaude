import { QueryFailedError } from 'typeorm';
import { loadOccupancySettings } from './occupancy-settings.js';
import {
  isPermanentFailure,
  OccupancyProcessorService,
} from './occupancy-processor.service.js';

function sqlError(code: string): QueryFailedError {
  return new QueryFailedError(
    'SELECT 1',
    [],
    Object.assign(new Error('pg'), { code }),
  );
}

function repositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    processPending: vi.fn().mockResolvedValue({ processed: 0, applied: 0 }),
    findPendingEventIds: vi.fn().mockResolvedValue([]),
    markFailed: vi.fn().mockResolvedValue(undefined),
    deleteProcessedBefore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const settings = {
  ...loadOccupancySettings({}),
  batchSize: 2,
  retentionMs: 3_600_000,
};

describe('OccupancyProcessorService', () => {
  it('keeps processing while the batches come back full', async () => {
    const repository = repositoryMock({
      processPending: vi
        .fn()
        .mockResolvedValueOnce({ processed: 2, applied: 2 })
        .mockResolvedValueOnce({ processed: 2, applied: 1 })
        .mockResolvedValueOnce({ processed: 1, applied: 0 }),
    });
    const processor = new OccupancyProcessorService(
      repository as never,
      settings,
    );

    await expect(processor.drain()).resolves.toBe(5);
    expect(repository.processPending).toHaveBeenCalledTimes(3);
    expect(repository.processPending).toHaveBeenCalledWith(2);
  });

  it('isolates a failing event instead of blocking the inbox', async () => {
    let batches = 0;
    const processPending = vi.fn((_limit: number, eventId?: string) => {
      if (eventId === 'BAD') return Promise.reject(sqlError('22P02'));
      if (eventId === 'GOOD')
        return Promise.resolve({ processed: 1, applied: 1 });
      // The first batch fails as a whole; the next one finds nothing left.
      batches += 1;
      return batches === 1
        ? Promise.reject(new Error('batch'))
        : Promise.resolve({ processed: 0, applied: 0 });
    });
    const repository = repositoryMock({
      processPending,
      findPendingEventIds: vi.fn().mockResolvedValue(['GOOD', 'BAD']),
    });
    const processor = new OccupancyProcessorService(
      repository as never,
      settings,
    );

    await expect(processor.drain()).resolves.toBe(2);

    expect(processPending).toHaveBeenCalledWith(1, 'GOOD');
    expect(processPending).toHaveBeenCalledWith(1, 'BAD');
    expect(repository.markFailed).toHaveBeenCalledWith('BAD', 'pg');
    expect(repository.markFailed).toHaveBeenCalledTimes(1);
  });

  it('leaves an event pending when its retry fails for a transient reason', async () => {
    const processPending = vi.fn((_limit: number, eventId?: string) =>
      Promise.reject(
        eventId === undefined ? new Error('batch') : sqlError('40P01'),
      ),
    );
    const repository = repositoryMock({
      processPending,
      findPendingEventIds: vi.fn().mockResolvedValue(['EVENT']),
    });
    const processor = new OccupancyProcessorService(
      repository as never,
      settings,
    );

    await expect(processor.drain()).rejects.toBeInstanceOf(QueryFailedError);
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('treats only data and integrity errors as final', () => {
    expect(isPermanentFailure(sqlError('22P02'))).toBe(true);
    expect(isPermanentFailure(sqlError('23502'))).toBe(true);
    expect(isPermanentFailure(sqlError('40P01'))).toBe(false);
    expect(isPermanentFailure(sqlError('57014'))).toBe(false);
    expect(isPermanentFailure(new Error('connection reset'))).toBe(false);
  });

  it('removes processed events past the retention at most once an hour', async () => {
    const repository = repositoryMock();
    const processor = new OccupancyProcessorService(
      repository as never,
      settings,
    );
    const now = new Date('2026-10-15T12:00:00Z');

    await processor.sweep(now);
    await processor.sweep(new Date(now.getTime() + 60_000));

    expect(repository.deleteProcessedBefore).toHaveBeenCalledTimes(1);
    expect(repository.deleteProcessedBefore).toHaveBeenCalledWith(
      new Date('2026-10-15T11:00:00Z'),
    );
  });

  it('processes events even when the public visualization is disabled', async () => {
    vi.useFakeTimers();
    const repository = repositoryMock();
    const processor = new OccupancyProcessorService(repository as never, {
      ...settings,
      publicEnabled: false,
      processorEnabled: true,
    });
    try {
      processor.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(settings.processorIntervalMs);
      expect(repository.processPending).toHaveBeenCalledWith(
        settings.batchSize,
      );
    } finally {
      await processor.onApplicationShutdown();
      vi.useRealTimers();
    }
  });

  it('does not start a timer when the processor is turned off', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const processor = new OccupancyProcessorService(repositoryMock() as never, {
      ...settings,
      processorEnabled: false,
    });

    processor.onApplicationBootstrap();

    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });
});
