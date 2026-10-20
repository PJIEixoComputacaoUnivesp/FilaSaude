import { hasLocation, type HealthUnit } from "./units";

export type DirectionsTarget = "android" | "web";

/** Android hands a `geo:` link to the maps app the person chose. */
export function directionsTarget(
  userAgent = globalThis.navigator?.userAgent ?? "",
): DirectionsTarget {
  return /Android/i.test(userAgent) ? "android" : "web";
}

/**
 * A link that opens a maps app at the unit, for the person to plan the way.
 * It names no origin: the maps app uses the device's own position, so the
 * position FilaSaúde holds never goes into the URL. A point that is only the
 * centre of the municipality would route to the wrong place, so those units
 * are searched by name and address instead.
 */
export function directionsLink(
  unit: HealthUnit,
  target: DirectionsTarget,
): string {
  const { latitude, longitude, precision } = unit.location;
  const point =
    hasLocation(unit) && precision !== "municipality"
      ? `${latitude},${longitude}`
      : null;
  const { street, number, district, city, state } = unit.address;
  const query = [
    unit.name,
    [street, number].filter(Boolean).join(", "),
    district,
    `${city} - ${state}`,
  ]
    .filter(Boolean)
    .join(", ");

  if (target === "android") {
    return point
      ? `geo:${point}?q=${point}(${encodeURIComponent(unit.name)})`
      : `geo:0,0?q=${encodeURIComponent(query)}`;
  }
  const params = new URLSearchParams({
    api: "1",
    destination: point ?? query,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
