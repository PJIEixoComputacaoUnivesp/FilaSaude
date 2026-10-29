import type { OccupancyAttendanceValue } from '../database/entities/occupancy-current.entity.js';

export const WAIT_ESTIMATE_WINDOW_MS = 60 * 60_000;
const MINIMUM_WINDOW_MS = 15 * 60_000;
const MAXIMUM_GAP_MS = 10 * 60_000;

export interface WaitEstimateSample {
  eventId: string;
  sourceId: string;
  attendance: OccupancyAttendanceValue | null;
  occurredAt: Date;
  observedAt: Date;
  receivedAt: Date;
}

export type WaitEstimate =
  | {
      status: 'available';
      minutes: number;
      method: 'recent-start-rate';
      sampleCount: number;
      started: number;
      windowStart: string;
      windowEnd: string;
    }
  | {
      status: 'unavailable';
      reason:
        'missing-data' | 'stale' | 'insufficient-history' | 'no-throughput';
    };

/**
 * Aggregate queue estimate, not a measured mean of individual waiting times.
 * Conservation gives starts = Δcompleted + ΔinService. The queue is divided
 * by this recent start rate. Beds and simulator profile parameters never enter.
 */
export function estimateWait(
  current: WaitEstimateSample,
  history: readonly WaitEstimateSample[],
  now: Date,
  staleAfterMs: number,
): WaitEstimate {
  if (now.getTime() - current.observedAt.getTime() > staleAfterMs)
    return { status: 'unavailable', reason: 'stale' };
  if (current.attendance?.waiting === undefined || !hasFlow(current))
    return { status: 'unavailable', reason: 'missing-data' };

  const cutoff = current.occurredAt.getTime() - WAIT_ESTIMATE_WINDOW_MS;
  const ordered = [
    ...history.filter((point) => point.eventId !== current.eventId),
    current,
  ]
    .filter(
      (point) =>
        point.occurredAt.getTime() >= cutoff && compare(point, current) <= 0,
    )
    .sort(compare);
  // Corrections at the same occurrence replace the earlier reading. They do
  // not add an interval or a sample to the observed rate.
  const unique: WaitEstimateSample[] = [];
  for (const point of ordered) {
    if (unique.at(-1)?.occurredAt.getTime() === point.occurredAt.getTime())
      unique.pop();
    unique.push(point);
  }

  let segment: WaitEstimateSample[] = [];
  for (const point of unique) {
    const previous = segment.at(-1);
    if (!hasFlow(point) || point.sourceId !== current.sourceId) {
      segment = [];
      continue;
    }
    if (previous) {
      const before = previous.attendance!;
      const after = point.attendance!;
      const completions = after.completed!.count - before.completed!.count;
      const starts = completions + after.inService! - before.inService!;
      if (
        point.occurredAt.getTime() - previous.occurredAt.getTime() >
          MAXIMUM_GAP_MS ||
        before.completed!.periodStart !== after.completed!.periodStart ||
        before.completed!.periodEnd !== after.completed!.periodEnd ||
        completions < 0 ||
        starts < 0
      ) {
        segment = [];
      }
    }
    segment.push(point);
  }

  const first = segment[0];
  const elapsed = first
    ? current.occurredAt.getTime() - first.occurredAt.getTime()
    : 0;
  if (!first || segment.length < 3 || elapsed < MINIMUM_WINDOW_MS)
    return { status: 'unavailable', reason: 'insufficient-history' };
  const starts =
    current.attendance.completed!.count -
    first.attendance!.completed!.count +
    current.attendance.inService! -
    first.attendance!.inService!;
  if (!Number.isSafeInteger(starts))
    return { status: 'unavailable', reason: 'missing-data' };
  if (starts <= 0) return { status: 'unavailable', reason: 'no-throughput' };
  const minutes = Math.ceil(
    (current.attendance.waiting * (elapsed / 60_000)) / starts,
  );
  if (!Number.isSafeInteger(minutes))
    return { status: 'unavailable', reason: 'missing-data' };
  return {
    status: 'available',
    minutes,
    method: 'recent-start-rate',
    sampleCount: segment.length,
    started: starts,
    windowStart: first.occurredAt.toISOString(),
    windowEnd: current.occurredAt.toISOString(),
  };
}

function hasFlow(point: WaitEstimateSample): boolean {
  return (
    point.attendance?.inService !== undefined &&
    point.attendance.completed !== undefined
  );
}

function compare(left: WaitEstimateSample, right: WaitEstimateSample): number {
  return (
    left.occurredAt.getTime() - right.occurredAt.getTime() ||
    left.observedAt.getTime() - right.observedAt.getTime() ||
    left.receivedAt.getTime() - right.receivedAt.getTime() ||
    left.eventId.localeCompare(right.eventId)
  );
}
