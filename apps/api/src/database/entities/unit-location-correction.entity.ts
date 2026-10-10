import { Column, Entity, PrimaryColumn } from 'typeorm';
import { decimalTransformer } from './health-unit.entity.js';

export const ANCHOR_STREET_MAX_LENGTH = 255;
export const ANCHOR_NUMBER_MAX_LENGTH = 32;

/**
 * CNES values can be longer than the columns that keep them, and an insert
 * that does not fit fails. The anchor is compared as stored, so both sides use
 * the same cut.
 */
export function fitAnchor(
  value: string | null,
  maxLength: number,
): string | null {
  return value === null ? null : value.slice(0, maxLength);
}

/**
 * A position set by an administrator for one unit. It also keeps the CNES
 * state it was made against (the anchor), so that a later relocation of the
 * unit stops the correction from being applied.
 */
@Entity({ name: 'unit_location_corrections' })
export class UnitLocationCorrectionEntity {
  @PrimaryColumn({ name: 'cnes_code', type: 'varchar', length: 7 })
  cnesCode!: string;

  @Column({
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  latitude!: number;

  @Column({
    type: 'numeric',
    precision: 9,
    scale: 6,
    transformer: decimalTransformer,
  })
  longitude!: number;

  /** Who verified the position. Never part of a public response. */
  @Column({ name: 'verified_by', type: 'varchar', length: 80 })
  verifiedBy!: string;

  /** How the position was verified. Never part of a public response. */
  @Column({ type: 'text' })
  method!: string;

  @Column({ name: 'corrected_at', type: 'timestamptz' })
  correctedAt!: Date;

  @Column({ name: 'anchor_municipality_code', type: 'char', length: 6 })
  anchorMunicipalityCode!: string;

  @Column({
    name: 'anchor_street',
    type: 'varchar',
    length: ANCHOR_STREET_MAX_LENGTH,
    nullable: true,
  })
  anchorStreet!: string | null;

  @Column({
    name: 'anchor_number',
    type: 'varchar',
    length: ANCHOR_NUMBER_MAX_LENGTH,
    nullable: true,
  })
  anchorNumber!: string | null;

  @Column({
    name: 'anchor_latitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  anchorLatitude!: number | null;

  @Column({
    name: 'anchor_longitude',
    type: 'numeric',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  anchorLongitude!: number | null;
}
