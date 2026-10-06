import { Injectable, Logger } from '@nestjs/common';
import { isSameAddress } from './address-match.js';
import {
  CnesHistoryClient,
  type CnesHistoryEntry,
} from './cnes-history.client.js';
import { centerOfArea, distanceToAreaKm, type Polygon } from './geometry.js';
import {
  MunicipalityBoundariesClient,
  type MunicipalityBoundaries,
} from './municipality-boundaries.client.js';
import type { Coordinate, HealthUnit } from './units.types.js';

/** Boundaries are simplified, so points this close to the border are kept. */
export const BOUNDARY_TOLERANCE_KM = 5;
const BOUNDARIES_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// CNES publishes a release per month, so a day-old history is current enough.
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
// One deadline for the whole history phase, so a slow source cannot stretch
// the response by more than this.
const HISTORY_DEADLINE_MS = 10_000;
const HISTORY_CONCURRENCY = 5;

interface Misplaced {
  unit: HealthUnit;
  area: Polygon[];
  original: Coordinate | null;
  distanceKm: number | null;
}

interface HistoricalPoint {
  coordinate: Coordinate;
  referenceMonth: string;
}

@Injectable()
export class UnitLocationsService {
  private readonly logger = new Logger(UnitLocationsService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; boundaries: MunicipalityBoundaries }
  >();
  private readonly pending = new Map<string, Promise<MunicipalityBoundaries>>();
  // The raw releases are cached, not the chosen point: the choice depends on
  // the unit's current address, which can change between loads.
  private readonly historyCache = new Map<
    string,
    { expiresAt: number; entries: CnesHistoryEntry[] }
  >();
  private readonly historyPending = new Map<
    string,
    Promise<CnesHistoryEntry[]>
  >();

  constructor(
    private readonly boundariesClient: MunicipalityBoundariesClient,
    private readonly historyClient: CnesHistoryClient,
  ) {}

  /**
   * Checks each unit's CNES coordinate against its declared municipality.
   * A missing coordinate, or one farther than the tolerance from the
   * municipality, is replaced and flagged by `precision`, and the original
   * coordinate is kept for audit. In order of preference the replacement is:
   * the latest earlier CNES coordinate inside the municipality that was
   * registered for the same address (`history`), then the municipality
   * center (`municipality`). Units are never dropped.
   *
   * When boundaries cannot be loaded the units are returned untouched and
   * `validated` is false. When the history cannot be fully loaded the
   * affected units fall back to the municipality center and `historyComplete`
   * is false. Either way the caller should check again sooner than usual.
   * `history: false` skips the history lookup, for when the CNES host is
   * already known to be unavailable.
   */
  async apply(
    units: readonly HealthUnit[],
    options: { history?: boolean } = {},
  ): Promise<{
    units: HealthUnit[];
    validated: boolean;
    historyComplete: boolean;
  }> {
    const states = [...new Set(units.map((unit) => unit.address.state))];
    let boundaries: MunicipalityBoundaries[];
    try {
      boundaries = await Promise.all(
        states.map((state) => this.boundariesOf(state)),
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Municipality boundaries unavailable: ${reason}`);
      return { units: [...units], validated: false, historyComplete: true };
    }

    const byMunicipality = new Map<string, Polygon[]>();
    for (const stateBoundaries of boundaries) {
      for (const [code, area] of stateBoundaries)
        byMunicipality.set(code, area);
    }

    const checks = units.map((unit) =>
      this.check(unit, byMunicipality.get(unit.address.municipalityCode)),
    );
    const misplaced = checks.filter((check) => check !== null);
    const { histories, complete } =
      options.history === false
        ? { histories: new Map<string, CnesHistoryEntry[]>(), complete: true }
        : await this.loadHistories(misplaced.map(({ unit }) => unit.id));

    return {
      units: units.map((unit, index) => {
        const check = checks[index];
        return check ? this.relocate(check, histories.get(unit.id)) : unit;
      }),
      validated: true,
      historyComplete: complete,
    };
  }

  /** Returns what to relocate, or null when the coordinate can be kept. */
  private check(unit: HealthUnit, area: Polygon[] | undefined) {
    // Without a boundary there is nothing to compare against, so the CNES
    // coordinate stays as the source declared it. This happens for a
    // municipality newer than the IBGE boundaries.
    if (!area) {
      this.logger.warn(
        `CNES ${unit.id}: no IBGE boundary for municipality ${unit.address.municipalityCode}; keeping the CNES coordinate unchecked`,
      );
      return null;
    }

    const { latitude, longitude } = unit.location;
    const original =
      latitude !== null && longitude !== null ? { latitude, longitude } : null;
    const distanceKm = original ? distanceToAreaKm(area, original) : null;
    if (distanceKm !== null && distanceKm <= BOUNDARY_TOLERANCE_KM) return null;

    return { unit, area, original, distanceKm } satisfies Misplaced;
  }

  private relocate(
    { unit, area, original, distanceKm }: Misplaced,
    history: readonly CnesHistoryEntry[] | undefined,
  ): HealthUnit {
    const where = `${unit.address.city} - ${unit.address.state}`;
    const reason = original
      ? `coordinate ${original.latitude},${original.longitude} is ${distanceKm!.toFixed(1)} km from ${where}`
      : `no valid coordinate for ${where}`;

    const point = history && this.latestSameAddressPoint(unit, area, history);
    if (point) {
      this.logger.warn(
        `CNES ${unit.id}: ${reason}; using the CNES point of ${point.referenceMonth} registered for the same address`,
      );
      return {
        ...unit,
        location: {
          ...point.coordinate,
          precision: 'history',
          original,
          referenceMonth: point.referenceMonth,
        },
      };
    }

    this.logger.warn(
      `CNES ${unit.id}: ${reason}; using the municipality center`,
    );
    return {
      ...unit,
      location: {
        ...centerOfArea(area),
        precision: 'municipality',
        original,
        referenceMonth: null,
      },
    };
  }

  /**
   * The most recent release whose coordinate is inside the municipality
   * (same tolerance as the current one) and whose street and number are the
   * ones the unit has now. A changed address means the unit may have moved,
   * so an older point is not trusted just for being valid.
   */
  private latestSameAddressPoint(
    unit: HealthUnit,
    area: Polygon[],
    history: readonly CnesHistoryEntry[],
  ): HistoricalPoint | undefined {
    const newestFirst = [...history].sort((left, right) =>
      right.referenceMonth.localeCompare(left.referenceMonth),
    );
    for (const entry of newestFirst) {
      if (entry.latitude === null || entry.longitude === null) continue;
      const coordinate = {
        latitude: entry.latitude,
        longitude: entry.longitude,
      };
      if (distanceToAreaKm(area, coordinate) > BOUNDARY_TOLERANCE_KM) continue;
      if (!isSameAddress(unit.address, entry)) continue;
      return { coordinate, referenceMonth: entry.referenceMonth };
    }
    return undefined;
  }

  /**
   * Loads the history of each unit with bounded concurrency under a single
   * deadline. A unit whose history fails or runs out of time is simply
   * missing from the result and `complete` is false.
   */
  private async loadHistories(ids: readonly string[]) {
    const histories = new Map<string, CnesHistoryEntry[]>();
    if (ids.length === 0) return { histories, complete: true };

    const deadline = AbortSignal.timeout(HISTORY_DEADLINE_MS);
    const queue = [...ids];
    const failures: string[] = [];
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          deadline.throwIfAborted();
          histories.set(id, await this.historyOf(id, deadline));
        } catch (error: unknown) {
          failures.push(error instanceof Error ? error.message : 'unknown');
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(HISTORY_CONCURRENCY, ids.length) }, worker),
    );

    if (failures.length > 0) {
      this.logger.warn(
        `CNES history unavailable for ${failures.length} of ${ids.length} units (${failures[0]}); falling back to the municipality center`,
      );
    }
    return { histories, complete: failures.length === 0 };
  }

  private historyOf(
    id: string,
    signal: AbortSignal,
  ): Promise<CnesHistoryEntry[]> {
    const cached = this.historyCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.entries);
    }

    let request = this.historyPending.get(id);
    if (!request) {
      request = this.historyClient
        .fetch(id, signal)
        .then((entries) => {
          this.historyCache.set(id, {
            expiresAt: Date.now() + HISTORY_TTL_MS,
            entries,
          });
          return entries;
        })
        .finally(() => this.historyPending.delete(id));
      this.historyPending.set(id, request);
    }
    return request;
  }

  private async boundariesOf(state: string): Promise<MunicipalityBoundaries> {
    const cached = this.cache.get(state);
    if (cached && cached.expiresAt > Date.now()) return cached.boundaries;

    let request = this.pending.get(state);
    if (!request) {
      request = this.boundariesClient
        .fetch(state)
        .then((boundaries) => {
          this.cache.set(state, {
            expiresAt: Date.now() + BOUNDARIES_TTL_MS,
            boundaries,
          });
          return boundaries;
        })
        .finally(() => this.pending.delete(state));
      this.pending.set(state, request);
    }
    return request;
  }
}
