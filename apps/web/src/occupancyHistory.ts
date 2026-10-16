import type { OccupancyHistoryPoint } from "./occupancy";

const HOUR_MS = 3_600_000;

/**
 * The text alternative of the history chart: the last snapshot of each hour,
 * newest first. A full day at one snapshot every two minutes would be about
 * 720 rows, too long to read; the chart keeps every point.
 */
export function hourlyHistory(
  points: readonly OccupancyHistoryPoint[],
): OccupancyHistoryPoint[] {
  const byHour = new Map<number, OccupancyHistoryPoint>();
  for (const point of points) {
    const hour = Math.floor(Date.parse(point.occurredAt) / HOUR_MS);
    const kept = byHour.get(hour);
    if (!kept || Date.parse(kept.occurredAt) <= Date.parse(point.occurredAt)) {
      byHour.set(hour, point);
    }
  }
  return [...byHour.values()].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  );
}

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Points of the chart in a 0..width by 0..height box: time on x across the
 * period ending at `now`, percentage on y (0% at the bottom). Points without
 * a percentage break the line, so a gap is never drawn as a value.
 */
export function chartSegments(
  points: readonly OccupancyHistoryPoint[],
  now: Date,
  periodHours: number,
  width: number,
  height: number,
): ChartPoint[][] {
  const end = now.getTime();
  const start = end - periodHours * HOUR_MS;
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];

  for (const point of points) {
    const time = Date.parse(point.occurredAt);
    if (point.percentage === null || time < start) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push({
      x: ((time - start) / (end - start)) * width,
      y: height - (Math.min(point.percentage, 100) / 100) * height,
    });
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
