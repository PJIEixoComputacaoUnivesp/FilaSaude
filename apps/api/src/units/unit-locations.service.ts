import { Injectable, Logger } from '@nestjs/common';
import { centerOfArea, distanceToAreaKm, type Polygon } from './geometry.js';
import {
  MunicipalityBoundariesClient,
  type MunicipalityBoundaries,
} from './municipality-boundaries.client.js';
import type { HealthUnit } from './units.types.js';

/** Boundaries are simplified, so points this close to the border are kept. */
export const BOUNDARY_TOLERANCE_KM = 5;
const BOUNDARIES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class UnitLocationsService {
  private readonly logger = new Logger(UnitLocationsService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; boundaries: MunicipalityBoundaries }
  >();
  private readonly pending = new Map<string, Promise<MunicipalityBoundaries>>();

  constructor(
    private readonly boundariesClient: MunicipalityBoundariesClient,
  ) {}

  /**
   * Checks each unit's CNES coordinate against its declared municipality.
   * A missing coordinate, or one farther than the tolerance from the
   * municipality, is replaced by the municipality center and flagged with
   * `precision: 'municipality'`; the original coordinate is kept for audit.
   * Units are never dropped. When boundaries cannot be loaded the units are
   * returned untouched and `validated` is false.
   */
  async apply(
    units: readonly HealthUnit[],
  ): Promise<{ units: HealthUnit[]; validated: boolean }> {
    const states = [...new Set(units.map((unit) => unit.address.state))];
    let boundaries: MunicipalityBoundaries[];
    try {
      boundaries = await Promise.all(
        states.map((state) => this.boundariesOf(state)),
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Municipality boundaries unavailable: ${reason}`);
      return { units: [...units], validated: false };
    }

    const byMunicipality = new Map<string, Polygon[]>();
    for (const stateBoundaries of boundaries) {
      for (const [code, area] of stateBoundaries)
        byMunicipality.set(code, area);
    }

    return {
      units: units.map((unit) =>
        this.locate(unit, byMunicipality.get(unit.address.municipalityCode)),
      ),
      validated: true,
    };
  }

  private locate(unit: HealthUnit, area: Polygon[] | undefined): HealthUnit {
    const { latitude, longitude } = unit.location;
    // Without a boundary there is nothing to compare against, so the CNES
    // coordinate stays as the source declared it.
    if (!area) return unit;

    const original =
      latitude !== null && longitude !== null ? { latitude, longitude } : null;
    const distanceKm = original ? distanceToAreaKm(area, original) : null;
    if (distanceKm !== null && distanceKm <= BOUNDARY_TOLERANCE_KM) return unit;

    const center = centerOfArea(area);
    this.logger.warn(
      original
        ? `CNES ${unit.id}: coordinate ${original.latitude},${original.longitude} is ${distanceKm!.toFixed(1)} km from ${unit.address.city} - ${unit.address.state}; using the municipality center`
        : `CNES ${unit.id}: no valid coordinate; using the center of ${unit.address.city} - ${unit.address.state}`,
    );
    return {
      ...unit,
      location: { ...center, precision: 'municipality', original },
    };
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
