export interface OccupancySettings {
  /** Public read endpoints exist only when the demonstration is on. */
  publicEnabled: boolean;
  /** Turn off to run the processor elsewhere (load tests, e2e). */
  processorEnabled: boolean;
  processorIntervalMs: number;
  batchSize: number;
  staleAfterMs: number;
  historyMs: number;
  retentionMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = environment[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadOccupancySettings(
  environment: NodeJS.ProcessEnv = process.env,
): OccupancySettings {
  const settings: OccupancySettings = {
    publicEnabled: environment.OCCUPANCY_SIMULATION_ENABLED === 'true',
    processorEnabled: environment.OCCUPANCY_PROCESSOR_ENABLED !== 'false',
    processorIntervalMs: positiveInteger(
      environment,
      'OCCUPANCY_PROCESSOR_INTERVAL_MS',
      2000,
    ),
    batchSize: positiveInteger(
      environment,
      'OCCUPANCY_PROCESSOR_BATCH_SIZE',
      500,
    ),
    staleAfterMs:
      positiveInteger(environment, 'OCCUPANCY_STALE_AFTER_MINUTES', 20) *
      MINUTE,
    historyMs:
      positiveInteger(environment, 'OCCUPANCY_HISTORY_HOURS', 24) * HOUR,
    retentionMs:
      positiveInteger(environment, 'OCCUPANCY_RETENTION_HOURS', 168) * HOUR,
  };
  if (settings.retentionMs < settings.historyMs) {
    throw new Error(
      'OCCUPANCY_RETENTION_HOURS must not be shorter than OCCUPANCY_HISTORY_HOURS',
    );
  }
  return settings;
}

export const OCCUPANCY_SETTINGS = Symbol('OCCUPANCY_SETTINGS');
