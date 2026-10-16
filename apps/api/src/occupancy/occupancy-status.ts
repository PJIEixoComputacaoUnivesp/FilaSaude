import type { OccupancyCategoryValue } from '../database/entities/occupancy-current.entity.js';

export type OccupancyLevel = 'low' | 'moderate' | 'high';
export type OccupancyConfirmation = 'recent' | 'stale';

/** Lower bounds, as fractions, of the moderate and high levels. */
export const OCCUPANCY_THRESHOLDS = { moderate: 0.6, high: 0.85 } as const;

export interface OccupancySummary {
  /** Sum of occupied over sum of capacity, rounded to a whole percent. */
  percentage: number | null;
  /** `null` when not informed, or when the last confirmation is too old. */
  level: OccupancyLevel | null;
  confirmation: OccupancyConfirmation;
}

/**
 * Overall occupancy of the informed categories. A missing category, or a
 * total capacity of zero, means "not informed", never zero. Once the source
 * stops confirming for longer than `staleAfterMs`, the level is dropped: a
 * stable value and a lost connection must not look the same.
 */
export function summarizeOccupancy(
  categories: readonly OccupancyCategoryValue[],
  observedAt: Date,
  now: Date,
  staleAfterMs: number,
): OccupancySummary {
  const capacity = categories.reduce((sum, item) => sum + item.capacity, 0);
  const occupied = categories.reduce((sum, item) => sum + item.occupied, 0);
  const ratio = capacity > 0 ? occupied / capacity : null;
  const confirmation: OccupancyConfirmation =
    now.getTime() - observedAt.getTime() > staleAfterMs ? 'stale' : 'recent';

  return {
    percentage: ratio === null ? null : Math.round(ratio * 100),
    level: ratio === null || confirmation === 'stale' ? null : levelOf(ratio),
    confirmation,
  };
}

export function levelOf(ratio: number): OccupancyLevel {
  if (ratio >= OCCUPANCY_THRESHOLDS.high) return 'high';
  if (ratio >= OCCUPANCY_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}
