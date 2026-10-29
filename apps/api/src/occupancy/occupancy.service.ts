import { Inject, Injectable } from '@nestjs/common';
import type {
  OccupancyAttendanceValue,
  OccupancyCategoryValue,
} from '../database/entities/occupancy-current.entity.js';
import { OccupancyRepository } from '../database/repositories/occupancy.repository.js';
import {
  estimateWait,
  isEstimable,
  WAIT_ESTIMATE_WINDOW_MS,
  type WaitEstimate,
  type WaitEstimateSample,
} from './wait-estimate.js';
import {
  OCCUPANCY_THRESHOLDS,
  WAITING_THRESHOLDS,
  summarizeUnitStatus,
  type OccupancyConfirmation,
  type OccupancyIndicator,
  type OccupancyLevel,
} from './occupancy-status.js';
import {
  OCCUPANCY_SETTINGS,
  type OccupancySettings,
} from './occupancy-settings.js';

export interface UnitOccupancy {
  unitCnes: string;
  eventId: string;
  /** Bed occupancy: sum of occupied over sum of capacity. */
  percentage: number | null;
  /** Highest level among the informed indicators. */
  level: OccupancyLevel | null;
  confirmation: OccupancyConfirmation;
  indicators: Record<OccupancyIndicator, OccupancyLevel | null>;
  levelDrivers: OccupancyIndicator[];
  categories: OccupancyCategoryValue[];
  /** `null` when the source does not inform the attendance flow. */
  attendance: OccupancyAttendanceValue | null;
  /** Calculated by FilaSaúde from received history, never supplied by a source. */
  waitEstimate: WaitEstimate;
  occurredAt: string;
  observedAt: string;
  receivedAt: string;
}

export interface OccupancyHistoryPoint {
  percentage: number | null;
  level: OccupancyLevel | null;
  levelDrivers: OccupancyIndicator[];
  categories: OccupancyCategoryValue[];
  attendance: OccupancyAttendanceValue | null;
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
  waitingThresholds: { moderate: number; high: number };
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
  name: 'Simulador de ocupação e atendimento do FilaSaúde',
  description:
    'Dados sintéticos de leitos, espera, atendimento, capacidade e serviços para demonstração acadêmica. O FilaSaúde calcula a espera estimada pelo histórico sintético; ela não prevê a espera real nem recomenda unidades.',
};

@Injectable()
export class OccupancyService {
  constructor(
    private readonly repository: OccupancyRepository,
    @Inject(OCCUPANCY_SETTINGS) private readonly settings: OccupancySettings,
  ) {}

  async findCurrent(now = new Date()): Promise<OccupancyResponse> {
    const rows = await this.repository.findCurrent();
    const history = await this.findEstimateHistory(rows, now);
    return {
      data: rows.map((row) =>
        this.toUnitOccupancy(row, now, history.get(row.unitCnes)),
      ),
      metadata: this.metadata(now),
    };
  }

  async findCurrentForUnits(
    unitCnes: readonly string[],
    now = new Date(),
  ): Promise<OccupancyResponse> {
    const rows = await this.repository.findCurrentForUnits(unitCnes);
    const history = await this.findEstimateHistory(rows, now);
    return {
      data: rows.map((row) =>
        this.toUnitOccupancy(row, now, history.get(row.unitCnes)),
      ),
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
    const estimateHistory = await this.findEstimateHistory(
      current ? [current] : [],
      now,
    );

    return {
      data: {
        unitCnes,
        current: current
          ? this.toUnitOccupancy(current, now, estimateHistory.get(unitCnes))
          : null,
        // Each point is read as it was when observed, so it is never stale.
        history: history.map((row) => {
          const { percentage, level, levelDrivers } = summarizeUnitStatus(
            row.categories,
            row.attendance,
            row.observedAt,
            row.observedAt,
            this.settings.staleAfterMs,
          );
          return {
            percentage,
            level,
            levelDrivers,
            categories: row.categories,
            attendance: row.attendance,
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

  /** Avoid reading history that the estimator cannot use, in every public view. */
  private findEstimateHistory(
    rows: readonly (WaitEstimateSample & { unitCnes: string })[],
    now: Date,
  ): Promise<Map<string, WaitEstimateSample[]>> {
    const eligible = rows.filter((row) =>
      isEstimable(row, now, this.settings.staleAfterMs),
    );
    return eligible.length === 0
      ? Promise.resolve(new Map())
      : this.repository.findWaitEstimateHistory(
          eligible,
          WAIT_ESTIMATE_WINDOW_MS,
        );
  }

  private toUnitOccupancy(
    row: {
      unitCnes: string;
      eventId: string;
      sourceId: string;
      categories: OccupancyCategoryValue[];
      attendance: OccupancyAttendanceValue | null;
      occurredAt: Date;
      observedAt: Date;
      receivedAt: Date;
    },
    now: Date,
    history: readonly WaitEstimateSample[] = [],
  ): UnitOccupancy {
    return {
      unitCnes: row.unitCnes,
      eventId: row.eventId,
      ...summarizeUnitStatus(
        row.categories,
        row.attendance,
        row.observedAt,
        now,
        this.settings.staleAfterMs,
      ),
      categories: row.categories.map(({ code, capacity, occupied }) => ({
        code,
        capacity,
        occupied,
      })),
      attendance: row.attendance ?? null,
      waitEstimate: estimateWait(row, history, now, this.settings.staleAfterMs),
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
      waitingThresholds: { ...WAITING_THRESHOLDS },
    };
  }
}
