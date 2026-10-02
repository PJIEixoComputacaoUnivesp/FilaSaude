import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'health_units' })
@Index('idx_health_units_state', ['state'])
@Index('idx_health_units_city', ['city'])
export class HealthUnitEntity {
  @PrimaryColumn({ name: 'cnes_code', type: 'varchar', length: 7 })
  cnesCode!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'unit_type', type: 'varchar', length: 64 })
  unitType!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  street!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  number!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  district!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 8, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'varchar', length: 128 })
  city!: string;

  @Column({ type: 'char', length: 2 })
  state!: string;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  latitude!: number | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  longitude!: number | null;

  @Column({ name: 'service_hours', type: 'text', nullable: true })
  serviceHours!: string | null;

  @Column({ name: 'source_name', type: 'varchar', length: 255 })
  sourceName!: string;

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl!: string;

  @Column({ name: 'source_updated_at', type: 'date' })
  sourceUpdatedAt!: string;

  @Column({ name: 'ingested_at', type: 'timestamptz' })
  ingestedAt!: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
