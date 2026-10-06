import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from './health-unit.entity.js';

export type CorrectionAction = 'set' | 'replace' | 'remove';

/**
 * One row per change to a manual correction: who did it, when, and the
 * position before and after. Append-only: nothing in the application updates
 * or deletes these rows, so a removed correction still leaves its history.
 */
@Entity({ name: 'unit_location_correction_events' })
@Index('idx_unit_location_correction_events_cnes', ['cnesCode', 'occurredAt'])
export class UnitLocationCorrectionEventEntity {
  @PrimaryGeneratedColumn('identity')
  id!: number;

  @Column({ name: 'cnes_code', type: 'varchar', length: 7 })
  cnesCode!: string;

  @Column({ type: 'varchar', length: 8 })
  action!: CorrectionAction;

  /** The login of the administrator, taken from the token. */
  @Column({ type: 'varchar', length: 39 })
  actor!: string;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  method!: string | null;

  @Column({
    name: 'previous_latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  previousLatitude!: number | null;

  @Column({
    name: 'previous_longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  previousLongitude!: number | null;

  @Column({
    name: 'new_latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  newLatitude!: number | null;

  @Column({
    name: 'new_longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  newLongitude!: number | null;
}
