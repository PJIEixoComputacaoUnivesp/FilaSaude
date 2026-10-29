export const OCCUPANCY_SNAPSHOT_TYPE = 'occupancy.snapshot.v1' as const;
/** v1 plus the optional attendance flow (docs/contracts/occupancy-snapshot-v2.md). */
export const OCCUPANCY_ATTENDANCE_SNAPSHOT_TYPE =
  'occupancy.snapshot.v2' as const;
export const OCCUPANCY_SNAPSHOT_TYPES = [
  OCCUPANCY_SNAPSHOT_TYPE,
  OCCUPANCY_ATTENDANCE_SNAPSHOT_TYPE,
] as const;

export const OCCUPANCY_CATEGORY_CODES = [
  'observation',
  'stabilization',
  'inpatient',
] as const;

export type OccupancyCategoryCode = (typeof OCCUPANCY_CATEGORY_CODES)[number];

export const SIMULATED_SERVICE_CODES = [
  'general-care',
  'nursing',
  'observation',
  'stabilization',
] as const;
export type SimulatedServiceCode = (typeof SIMULATED_SERVICE_CODES)[number];

export interface OccupancySnapshotCategory {
  code: OccupancyCategoryCode;
  capacity: number;
  occupied: number;
}

/** Absent fields are "not informed", never zero. */
export interface OccupancySnapshotAttendance {
  waiting?: number;
  inService?: number;
  serviceSlots?: number;
  installedServiceSlots?: number;
  services?: SimulatedServiceCode[];
  completed?: {
    count: number;
    /** Inclusive. */
    periodStart: string;
    /** Exclusive. */
    periodEnd: string;
  };
}

export interface OccupancySnapshot {
  eventId: string;
  type: (typeof OCCUPANCY_SNAPSHOT_TYPES)[number];
  unitCnes: string;
  occurredAt: string;
  observedAt: string;
  categories: OccupancySnapshotCategory[];
  attendance?: OccupancySnapshotAttendance;
}

export interface WebhookSourceConfiguration {
  secret: string;
  unitCnes: string[];
}
