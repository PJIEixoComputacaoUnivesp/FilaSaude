import { addressParts, hasLocation, type HealthUnit } from "./units";

export type DirectionsTarget = "android" | "web";

/**
 * In a geo: query, parentheses mark the pin's label, and encodeURIComponent
 * leaves them as they are; a name like "UPA 24h (Zona Norte)" would cut it.
 */
function encodeGeo(value: string): string {
  return encodeURIComponent(value).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** Android hands a geo: intent to the maps app the person chose. */
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
  const query = [unit.name, ...addressParts(unit.address)].join(", ");
  const params = new URLSearchParams({
    api: "1",
    destination: point ?? query,
  });
  const web = `https://www.google.com/maps/dir/?${params.toString()}`;
  if (target === "web") return web;

  // An intent: link, not a bare geo: one: Android still offers the maps apps
  // (Chrome builds "geo:" + the part before #Intent), and a browser or device
  // with none of them opens Google Maps on the web instead of an error page.
  const geo = point
    ? `${point}?q=${point}(${encodeGeo(unit.name)})`
    : `0,0?q=${encodeGeo(query)}`;
  return `intent:${geo}#Intent;scheme=geo;S.browser_fallback_url=${encodeURIComponent(web)};end`;
}
