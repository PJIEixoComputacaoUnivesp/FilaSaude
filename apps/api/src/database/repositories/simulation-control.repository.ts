import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SimulationControlEntity } from '../entities/simulation-control.entity.js';

@Injectable()
export class SimulationControlRepository {
  constructor(
    @InjectRepository(SimulationControlEntity)
    private readonly repository: Repository<SimulationControlEntity>,
  ) {}

  find(): Promise<SimulationControlEntity | null> {
    return this.repository.findOneBy({ id: 1 });
  }

  /**
   * Records a new scenario unless the last change is newer than
   * `changedBefore`. The check and the write are one statement, so two
   * visitors clicking at once cannot both win the cooldown. Returns `null`
   * when the cooldown is still running.
   */
  async change(
    scenario: string,
    now: Date,
    expiresAt: Date,
    changedBefore: Date,
  ): Promise<SimulationControlEntity | null> {
    const rows = (await this.repository.query(
      `INSERT INTO simulation_control (id, scenario, changed_at, expires_at)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         scenario = EXCLUDED.scenario,
         changed_at = EXCLUDED.changed_at,
         expires_at = EXCLUDED.expires_at
       WHERE simulation_control.changed_at <= $4
       RETURNING id, scenario, changed_at, expires_at`,
      [scenario, now, expiresAt, changedBefore],
    )) as {
      id: number;
      scenario: string;
      changed_at: Date;
      expires_at: Date;
    }[];
    const row = rows[0];
    if (!row) return null;
    return Object.assign(new SimulationControlEntity(), {
      id: row.id,
      scenario: row.scenario,
      changedAt: new Date(row.changed_at),
      expiresAt: new Date(row.expires_at),
    });
  }
}
