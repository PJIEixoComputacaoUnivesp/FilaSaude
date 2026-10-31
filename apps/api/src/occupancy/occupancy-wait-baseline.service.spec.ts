import { loadOccupancySettings } from './occupancy-settings.js';
import { OccupancyWaitBaselineService } from './occupancy-wait-baseline.service.js';

const settings = loadOccupancySettings({});

function setup() {
  const repository = {
    recordWaitSamples: vi.fn().mockResolvedValue(undefined),
    deleteFlowSamplesBefore: vi.fn().mockResolvedValue(undefined),
  };
  const occupancy = {
    findCurrent: vi.fn().mockResolvedValue({
      data: [
        {
          unitCnes: '1234567',
          waitEstimate: { status: 'available', minutes: 20 },
        },
        {
          unitCnes: '7654321',
          waitEstimate: { status: 'unavailable', reason: 'stale' },
        },
      ],
    }),
  };
  return {
    repository,
    occupancy,
    service: new OccupancyWaitBaselineService(
      repository as never,
      occupancy as never,
      settings,
    ),
  };
}

describe('OccupancyWaitBaselineService', () => {
  it('records available estimates at the aligned instant of the cadence', async () => {
    const { repository, service } = setup();

    await service.sample(new Date('2026-10-31T12:07:30.000Z'));

    expect(repository.recordWaitSamples).toHaveBeenCalledWith(
      [{ unitCnes: '1234567', minutes: 20 }],
      new Date('2026-10-31T12:00:00.000Z'),
      new Date('2026-10-30T12:07:30.000Z'),
    );
  });

  it('runs once per cadence slot', async () => {
    const { occupancy, service } = setup();

    await service.sample(new Date('2026-10-31T12:01:00.000Z'));
    await service.sample(new Date('2026-10-31T12:14:59.000Z'));
    await service.sample(new Date('2026-10-31T12:15:00.000Z'));

    expect(occupancy.findCurrent).toHaveBeenCalledTimes(2);
  });

  it('bounds the flow samples and waits for the next slot after a failure', async () => {
    const { occupancy, repository, service } = setup();
    occupancy.findCurrent.mockRejectedValueOnce(new Error('database down'));

    await service.sample(new Date('2026-10-31T12:01:00.000Z'));
    await service.sample(new Date('2026-10-31T12:02:00.000Z'));

    expect(repository.deleteFlowSamplesBefore).toHaveBeenCalledOnce();
    expect(occupancy.findCurrent).toHaveBeenCalledOnce();
    expect(repository.recordWaitSamples).not.toHaveBeenCalled();
  });

  it('keeps the reading when only the cleanup fails', async () => {
    const { repository, service } = setup();
    repository.deleteFlowSamplesBefore.mockRejectedValueOnce(
      new Error('lock timeout'),
    );

    await service.sample(new Date('2026-10-31T12:01:00.000Z'));

    expect(repository.recordWaitSamples).toHaveBeenCalledOnce();
  });

  it('keeps flow samples for the oldest window that can still be estimated', async () => {
    const { repository, service } = setup();

    await service.sample(new Date('2026-10-31T12:00:00.000Z'));

    expect(repository.deleteFlowSamplesBefore).toHaveBeenCalledWith(
      new Date('2026-10-31T10:25:00.000Z'),
    );
  });
});
