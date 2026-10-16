import { loadOccupancySettings } from './occupancy-settings.js';

describe('loadOccupancySettings', () => {
  it('keeps the public routes off and the processor on by default', () => {
    expect(loadOccupancySettings({})).toEqual({
      publicEnabled: false,
      processorEnabled: true,
      processorIntervalMs: 2000,
      batchSize: 500,
      staleAfterMs: 20 * 60_000,
      historyMs: 24 * 3_600_000,
      retentionMs: 168 * 3_600_000,
    });
  });

  it('reads the flags and the intervals', () => {
    const settings = loadOccupancySettings({
      OCCUPANCY_SIMULATION_ENABLED: 'true',
      OCCUPANCY_PROCESSOR_ENABLED: 'false',
      OCCUPANCY_STALE_AFTER_MINUTES: '5',
      OCCUPANCY_PROCESSOR_BATCH_SIZE: '50',
    });

    expect(settings).toMatchObject({
      publicEnabled: true,
      processorEnabled: false,
      staleAfterMs: 5 * 60_000,
      batchSize: 50,
    });
  });

  it('only turns the public routes on with an explicit true', () => {
    expect(
      loadOccupancySettings({ OCCUPANCY_SIMULATION_ENABLED: '1' })
        .publicEnabled,
    ).toBe(false);
  });

  it('rejects invalid numbers and a retention shorter than the history', () => {
    expect(() =>
      loadOccupancySettings({ OCCUPANCY_PROCESSOR_BATCH_SIZE: '0' }),
    ).toThrow('OCCUPANCY_PROCESSOR_BATCH_SIZE');
    expect(() =>
      loadOccupancySettings({
        OCCUPANCY_HISTORY_HOURS: '48',
        OCCUPANCY_RETENTION_HOURS: '24',
      }),
    ).toThrow('OCCUPANCY_RETENTION_HOURS');
  });
});
