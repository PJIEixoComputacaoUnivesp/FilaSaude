import type { WaitEstimate } from './wait-estimate.js';

/** Period of the unit's own estimates that defines what is usual for it. */
export const WAIT_BASELINE_WINDOW_MS = 24 * 60 * 60_000;
/** Cadence of the readings that feed the baseline. */
export const WAIT_SAMPLE_INTERVAL_MS = 15 * 60_000;
/** Twelve hours of readings, so one quiet morning does not define the usual. */
const MINIMUM_SAMPLES = 48;
/**
 * Most readings of a unit are zero, so the 90th percentile alone would flag a
 * few minutes of queue. The margin keeps the flag on differences that matter.
 */
const MINIMUM_MARGIN_MINUTES = 15;
const MAXIMUM_BASELINE_AGE_MS = 60 * 60_000;

export interface WaitBaseline {
  /** Median of the unit's readings in the period. */
  typicalMinutes: number;
  /** 90th percentile of the unit's readings in the period. */
  upperMinutes: number;
  sampleCount: number;
  windowStart: Date;
  windowEnd: Date;
}

export type WaitComparison =
  | {
      status: 'above-usual' | 'usual';
      typicalMinutes: number;
      upperMinutes: number;
      sampleCount: number;
      windowStart: string;
      windowEnd: string;
    }
  | { status: 'unavailable' };

/**
 * Compares a unit only with its own recent readings, never with other units.
 * It describes the estimate and does not take part in color or ordering.
 */
export function compareWait(
  estimate: WaitEstimate,
  baseline: WaitBaseline | undefined,
  now: Date,
): WaitComparison {
  if (
    estimate.status !== 'available' ||
    !baseline ||
    baseline.sampleCount < MINIMUM_SAMPLES ||
    now.getTime() - baseline.windowEnd.getTime() > MAXIMUM_BASELINE_AGE_MS
  )
    return { status: 'unavailable' };
  return {
    status:
      estimate.minutes > baseline.upperMinutes &&
      estimate.minutes >= baseline.typicalMinutes + MINIMUM_MARGIN_MINUTES
        ? 'above-usual'
        : 'usual',
    typicalMinutes: baseline.typicalMinutes,
    upperMinutes: baseline.upperMinutes,
    sampleCount: baseline.sampleCount,
    windowStart: baseline.windowStart.toISOString(),
    windowEnd: baseline.windowEnd.toISOString(),
  };
}
