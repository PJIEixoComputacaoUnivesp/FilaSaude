/** A GeoJSON position: [longitude, latitude]. */
export type Position = readonly [number, number];
/** The outer ring first, followed by the holes. */
export type Polygon = readonly (readonly Position[])[];

import type { Coordinate } from './units.types.js';

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_KM;

function insideRing(ring: readonly Position[], point: Position): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function insidePolygon(polygon: Polygon, point: Position): boolean {
  const [outer, ...holes] = polygon;
  return (
    outer !== undefined &&
    insideRing(outer, point) &&
    !holes.some((hole) => insideRing(hole, point))
  );
}

/** Distance in km from a point to a segment, on a plane local to the point. */
function distanceToSegmentKm(
  point: Position,
  start: Position,
  end: Position,
): number {
  const scaleX = Math.cos((point[1] * Math.PI) / 180);
  const ax = (start[0] - point[0]) * scaleX;
  const ay = start[1] - point[1];
  const bx = (end[0] - point[0]) * scaleX;
  const by = end[1] - point[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy) * KM_PER_DEGREE;
}

/** Distance in km from a point to the closest polygon edge. */
function distanceToPolygonEdgeKm(
  polygons: readonly Polygon[],
  point: Position,
): number {
  let closest = Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        closest = Math.min(
          closest,
          distanceToSegmentKm(point, ring[i]!, ring[i + 1]!),
        );
      }
    }
  }
  return closest;
}

/** Distance in km from a point to an area: 0 when the point is inside it. */
export function distanceToAreaKm(
  polygons: readonly Polygon[],
  coordinate: Coordinate,
): number {
  const point: Position = [coordinate.longitude, coordinate.latitude];
  if (polygons.some((polygon) => insidePolygon(polygon, point))) return 0;
  return distanceToPolygonEdgeKm(polygons, point);
}

function ringArea(ring: readonly Position[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    twice += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  }
  return twice / 2;
}

function ringCentroid(ring: readonly Position[]): Position {
  const area = ringArea(ring);
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const cross = ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
    x += (ring[i]![0] + ring[i + 1]![0]) * cross;
    y += (ring[i]![1] + ring[i + 1]![1]) * cross;
  }
  return [x / (6 * area), y / (6 * area)];
}

/** Midpoint of the widest stretch of the polygon along a horizontal line. */
function widestInteriorPoint(polygon: Polygon, latitude: number): Position {
  const crossings: number[] = [];
  for (const ring of polygon) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[i + 1]!;
      if (y1 > latitude !== y2 > latitude) {
        crossings.push(x1 + ((latitude - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
  }
  crossings.sort((a, b) => a - b);

  let best: Position | null = null;
  let bestWidth = -1;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const width = crossings[i + 1]! - crossings[i]!;
    if (width > bestWidth) {
      bestWidth = width;
      best = [(crossings[i]! + crossings[i + 1]!) / 2, latitude];
    }
  }
  return best ?? polygon[0]![0]!;
}

/**
 * A representative point of the area, taken from its largest polygon. It is
 * the centroid when that lies inside the polygon; concave shapes fall back to
 * a point on the same latitude that is guaranteed to be inside.
 */
export function centerOfArea(polygons: readonly Polygon[]): Coordinate {
  const largest = polygons.reduce((a, b) =>
    Math.abs(ringArea(b[0]!)) > Math.abs(ringArea(a[0]!)) ? b : a,
  );
  const centroid = ringCentroid(largest[0]!);
  const [longitude, latitude] = insidePolygon(largest, centroid)
    ? centroid
    : widestInteriorPoint(largest, centroid[1]);
  return { latitude, longitude };
}
