import { loadOccupancySettings } from './occupancy-settings.js';
import { OccupancyProcessorService } from './occupancy-processor.service.js';

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
      if (eventId === 'BAD') return Promise.reject(new Error('bad payload'));
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
    expect(repository.markFailed).toHaveBeenCalledWith('BAD', 'bad payload');
    expect(repository.markFailed).toHaveBeenCalledTimes(1);
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
