export const OCCUPANCY_SNAPSHOT_TYPE = 'occupancy.snapshot.v1' as const;

export const OCCUPANCY_CATEGORY_CODES = [
  'observation',
  'stabilization',
  'inpatient',
] as const;

export type OccupancyCategoryCode =
  (typeof OCCUPANCY_CATEGORY_CODES)[number];

export interface OccupancySnapshotCategory {
  code: OccupancyCategoryCode;
  capacity: number;
  occupied: number;
}

export interface OccupancySnapshot {
  eventId: string;
  type: typeof OCCUPANCY_SNAPSHOT_TYPE;
  unitCnes: string;
  occurredAt: string;
  observedAt: string;
  categories: OccupancySnapshotCategory[];
}

export interface WebhookSourceConfiguration {
  secret: string;
  unitCnes: string[];
}
