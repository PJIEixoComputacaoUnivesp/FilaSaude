import { Inject, Injectable } from '@nestjs/common';
import type { OccupancyCategoryValue } from '../database/entities/occupancy-current.entity.js';
import { OccupancyRepository } from '../database/repositories/occupancy.repository.js';
import {
  OCCUPANCY_THRESHOLDS,
  summarizeOccupancy,
  type OccupancyConfirmation,
  type OccupancyLevel,
} from './occupancy-status.js';
import {
  OCCUPANCY_SETTINGS,
  type OccupancySettings,
} from './occupancy-settings.js';

export interface UnitOccupancy {
  unitCnes: string;
  percentage: number | null;
  level: OccupancyLevel | null;
  confirmation: OccupancyConfirmation;
  categories: OccupancyCategoryValue[];
  occurredAt: string;
  observedAt: string;
  receivedAt: string;
}

export interface OccupancyHistoryPoint {
  percentage: number | null;
  level: OccupancyLevel | null;
  categories: OccupancyCategoryValue[];
  occurredAt: string;
  observedAt: string;
  receivedAt: string;
}

/**
 * Every response with operational data carries it: the values are synthetic,
 * produced by the project's simulator, and must never read as real.
 */
export interface OccupancyMetadata {
  simulated: true;
  source: { name: string; description: string };
  generatedAt: string;
  staleAfterMinutes: number;
  thresholds: { moderate: number; high: number };
}

export interface OccupancyResponse {
  data: UnitOccupancy[];
  metadata: OccupancyMetadata;
}

export interface OccupancyHistoryResponse {
  data: {
    unitCnes: string;
    current: UnitOccupancy | null;
    history: OccupancyHistoryPoint[];
  };
  metadata: OccupancyMetadata & { periodHours: number };
}

const SOURCE = {
  name: 'Simulador de ocupação do FilaSaúde',
  description:
    'Dados sintéticos gerados para demonstração acadêmica. Não representam a ocupação real das unidades.',
};

@Injectable()
export class OccupancyService {
  constructor(
    private readonly repository: OccupancyRepository,
    @Inject(OCCUPANCY_SETTINGS) private readonly settings: OccupancySettings,
  ) {}

  async findCurrent(now = new Date()): Promise<OccupancyResponse> {
    const rows = await this.repository.findCurrent();
    return {
      data: rows.map((row) => this.toUnitOccupancy(row, now)),
      metadata: this.metadata(now),
    };
  }

  async findHistory(
    unitCnes: string,
    now = new Date(),
  ): Promise<OccupancyHistoryResponse> {
    const since = new Date(now.getTime() - this.settings.historyMs);
    const [current, history] = await Promise.all([
      this.repository.findCurrentByUnit(unitCnes),
      this.repository.findHistory(unitCnes, since),
    ]);

    return {
      data: {
        unitCnes,
        current: current ? this.toUnitOccupancy(current, now) : null,
        // Each point is read as it was when observed, so it is never stale.
        history: history.map((row) => {
          const { percentage, level } = summarizeOccupancy(
            row.categories,
            row.observedAt,
            row.observedAt,
            this.settings.staleAfterMs,
          );
          return {
            percentage,
            level,
            categories: row.categories,
            occurredAt: row.occurredAt.toISOString(),
            observedAt: row.observedAt.toISOString(),
            receivedAt: row.receivedAt.toISOString(),
          };
        }),
      },
      metadata: {
        ...this.metadata(now),
        periodHours: Math.round(this.settings.historyMs / 3_600_000),
      },
    };
  }

  private toUnitOccupancy(
    row: {
      unitCnes: string;
      categories: OccupancyCategoryValue[];
      occurredAt: Date;
      observedAt: Date;
      receivedAt: Date;
    },
    now: Date,
  ): UnitOccupancy {
    return {
      unitCnes: row.unitCnes,
      ...summarizeOccupancy(
        row.categories,
        row.observedAt,
        now,
        this.settings.staleAfterMs,
      ),
      categories: row.categories.map(({ code, capacity, occupied }) => ({
        code,
        capacity,
        occupied,
      })),
      occurredAt: row.occurredAt.toISOString(),
      observedAt: row.observedAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
    };
  }

  private metadata(now: Date): OccupancyMetadata {
    return {
      simulated: true,
      source: SOURCE,
      generatedAt: now.toISOString(),
      staleAfterMinutes: Math.round(this.settings.staleAfterMs / 60_000),
      thresholds: { ...OCCUPANCY_THRESHOLDS },
    };
  }
}
