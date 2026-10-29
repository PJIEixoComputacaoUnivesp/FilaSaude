import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { SimulatedServiceCode } from '../../webhooks/occupancy-snapshot.types.js';

export interface OccupancyCategoryValue {
  code: string;
  capacity: number;
  occupied: number;
}

/** Attendance flow as sent in occupancy.snapshot.v2; absent means not informed. */
export interface OccupancyAttendanceValue {
  waiting?: number;
  inService?: number;
  serviceSlots?: number;
  installedServiceSlots?: number;
  services?: SimulatedServiceCode[];
  completed?: { count: number; periodStart: string; periodEnd: string };
}

@Entity({ name: 'occupancy_current' })
export class OccupancyCurrentEntity {
  @PrimaryColumn({ name: 'unit_cnes', type: 'varchar', length: 7 })
  unitCnes!: string;

  @Column({ name: 'event_id', type: 'varchar', length: 26 })
  eventId!: string;

  @Column({ name: 'source_id', type: 'varchar', length: 128 })
  sourceId!: string;

  @Column({ type: 'jsonb' })
  categories!: OccupancyCategoryValue[];

  @Column({ type: 'jsonb', nullable: true })
  attendance!: OccupancyAttendanceValue | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'observed_at', type: 'timestamptz' })
  observedAt!: Date;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
