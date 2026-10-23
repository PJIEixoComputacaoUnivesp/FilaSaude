import type {
  OccupancyAttendanceValue,
  OccupancyCategoryValue,
} from '../database/entities/occupancy-current.entity.js';

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

/**
 * Lower bounds of the moderate and high levels of the queue, in people
 * waiting per active service slot. Demonstration conventions (ADR 0007), not
 * clinical or operational standards.
 */
export const WAITING_THRESHOLDS = { moderate: 1, high: 3 } as const;

export type OccupancyIndicator = 'beds' | 'waiting';

export interface UnitStatusSummary extends OccupancySummary {
  /** Level of each indicator, `null` when not informed or stale. */
  indicators: Record<OccupancyIndicator, OccupancyLevel | null>;
  /** Indicators whose level is the final one; empty when there is none. */
  levelDrivers: OccupancyIndicator[];
}

const LEVEL_ORDER: readonly OccupancyLevel[] = ['low', 'moderate', 'high'];

/**
 * The map color is the highest level among the informed indicators: beds
 * (occupied over capacity) and the queue (people waiting per active service
 * slot). The raw waiting count is never turned into a percentage, and
 * completed attendances never take part, since they measure a period and not
 * the current situation. `percentage` stays the bed occupancy.
 */
export function summarizeUnitStatus(
  categories: readonly OccupancyCategoryValue[],
  attendance: OccupancyAttendanceValue | null,
  observedAt: Date,
  now: Date,
  staleAfterMs: number,
): UnitStatusSummary {
  const beds = summarizeOccupancy(categories, observedAt, now, staleAfterMs);
  const waitingRatio =
    attendance?.waiting !== undefined && attendance.serviceSlots
      ? attendance.waiting / attendance.serviceSlots
      : null;
  const indicators: Record<OccupancyIndicator, OccupancyLevel | null> = {
    beds: beds.level,
    waiting:
      waitingRatio === null || beds.confirmation === 'stale'
        ? null
        : waitingLevelOf(waitingRatio),
  };

  const informed = (Object.keys(indicators) as OccupancyIndicator[]).filter(
    (indicator) => indicators[indicator] !== null,
  );
  const level = informed.reduce<OccupancyLevel | null>((highest, indicator) => {
    const current = indicators[indicator]!;
    return highest === null ||
      LEVEL_ORDER.indexOf(current) > LEVEL_ORDER.indexOf(highest)
      ? current
      : highest;
  }, null);

  return {
    ...beds,
    level,
    indicators,
    levelDrivers: informed.filter(
      (indicator) => indicators[indicator] === level,
    ),
  };
}

export function waitingLevelOf(peoplePerSlot: number): OccupancyLevel {
  if (peoplePerSlot >= WAITING_THRESHOLDS.high) return 'high';
  if (peoplePerSlot >= WAITING_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}
