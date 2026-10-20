import { hasLocation, type HealthUnit } from "./units";
import type { LocationState } from "./useUserLocation";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

/** A position less precise than this would give distances made of noise. */
export const MAX_DISTANCE_ACCURACY_M = 5_000;

export const SEARCH_RADIUS_STEPS_KM = [5, 10, 25, 50, 100, 250, 500] as const;

const earthRadiusKm = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line (great-circle) distance in km, by the Haversine formula. */
export function calculateDistanceKm(from: Coordinate, to: Coordinate): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Rounded on purpose: the person's position and many unit coordinates are
 * approximate, so a decimal of kilometers would promise a precision neither
 * has. Half a kilometer below 10 km, whole kilometers above.
 */
export function formatDistanceKm(km: number): string {
  if (km < 0.5) return "menos de 0,5 km";
  const rounded = km < 10 ? Math.round(km * 2) / 2 : Math.round(km);
  return `≈ ${rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

/** Distance from `origin` to each unit with a position on the map, by CNES. */
export function distancesFrom(
  origin: Coordinate,
  units: HealthUnit[],
): ReadonlyMap<string, number> {
  return new Map(
    units.filter(hasLocation).map((unit) => [
      unit.id,
      calculateDistanceKm(origin, {
        latitude: unit.location.latitude!,
        longitude: unit.location.longitude!,
      }),
    ]),
  );
}

/**
 * Chooses the first search radius that contains at least three units, while
 * never using a radius smaller than the reported location accuracy. Sparse
 * regions expand to the maximum radius and keep their available results.
 */
export function initialSearchRadiusKm(
  origin: Coordinate,
  accuracyM: number,
  units: HealthUnit[],
): number {
  const minimumKm = Math.max(5, Math.ceil(accuracyM / 1000));
  const distances = distancesFrom(origin, units);
  return (
    SEARCH_RADIUS_STEPS_KM.find(
      (radius) =>
        radius >= minimumKm &&
        [...distances.values()].filter((distance) => distance <= radius).length >= 3,
    ) ?? SEARCH_RADIUS_STEPS_KM.at(-1)!
  );
}

/** Radius steps that add at least one positioned unit as they expand. */
export function availableSearchRadiiKm(
  origin: Coordinate,
  accuracyM: number,
  units: HealthUnit[],
): number[] {
  const minimumKm = Math.max(5, Math.ceil(accuracyM / 1000));
  const distances = distancesFrom(origin, units);
  let previousCount = 0;
  const options: number[] = [];
  for (const radius of SEARCH_RADIUS_STEPS_KM) {
    if (radius < minimumKm) continue;
    const count = [...distances.values()].filter((distance) => distance <= radius).length;
    const addsUnits = count !== previousCount;
    previousCount = count;
    if (addsUnits) options.push(radius);
  }
  return options;
}

/** Keeps only units whose known coordinates fall within a straight-line radius. */
export function filterUnitsWithinRadius(
  units: HealthUnit[],
  distances: ReadonlyMap<string, number>,
  radiusKm: number,
): HealthUnit[] {
  return units.filter((unit) => (distances.get(unit.id) ?? Infinity) <= radiusKm);
}

/**
 * Nearest first, by straight line only: no travel time, capacity or any
 * other criterion. Units without a position go last, in their given order.
 */
export function sortByDistance(
  units: HealthUnit[],
  distances: ReadonlyMap<string, number>,
): HealthUnit[] {
  const distance = (unit: HealthUnit) => distances.get(unit.id) ?? Infinity;
  return [...units].sort((a, b) => {
    const difference = distance(a) - distance(b);
    return Number.isNaN(difference) ? 0 : difference;
  });
}

/** The person's position, when precise enough to measure distances from. */
export function distanceOrigin(state: LocationState): Coordinate | null {
  return state.status === "success" &&
    state.position.accuracy <= MAX_DISTANCE_ACCURACY_M
    ? state.position
    : null;
}

/** Straight-line distance, said as such; never a suggestion of where to go. */
export function formatUnitDistance(
  unit: HealthUnit,
  km: number | undefined,
): string {
  if (km === undefined) return "Distância indisponível";
  return unit.location.precision === "municipality"
    ? `${formatDistanceKm(km)} até o centro do município`
    : `${formatDistanceKm(km)} em linha reta`;
}

/** Distance from `origin` to one unit, when the unit has a position. */
export function distanceToUnit(
  origin: Coordinate,
  unit: HealthUnit,
): number | undefined {
  return distancesFrom(origin, [unit]).get(unit.id);
}
