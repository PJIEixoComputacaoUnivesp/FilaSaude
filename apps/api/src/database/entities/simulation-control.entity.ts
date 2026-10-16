import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'simulation_control' })
export class SimulationControlEntity {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  scenario!: string;

  @Column({ name: 'changed_at', type: 'timestamptz' })
  changedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
