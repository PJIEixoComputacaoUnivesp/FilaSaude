import { distanceOrigin, distanceToUnit, formatUnitDistance } from "./geo";
import type { HealthUnit } from "./units";
import { useUserLocation } from "./useUserLocation";

/**
 * "≈ 3,5 km em linha reta" from the person to the unit, or `null` while there
 * is no position precise enough (see distanceOrigin).
 */
export function useUnitDistance(unit: HealthUnit): string | null {
  const { state } = useUserLocation();
  const origin = distanceOrigin(state);
  return origin ? formatUnitDistance(unit, distanceToUnit(origin, unit)) : null;
}
