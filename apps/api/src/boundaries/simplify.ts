import type { Polygon, Position } from '../units/geometry.js';

/** Squared distance from a point to a segment, in degrees. */
function segmentDistanceSquared(
  point: Position,
  start: Position,
  end: Position,
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
              lengthSquared,
          ),
        );
  const x = start[0] + t * dx - point[0];
  const y = start[1] + t * dy - point[1];
  return x * x + y * y;
}

/** Douglas-Peucker on an open line: keeps both ends. */
function simplifyLine(
  line: readonly Position[],
  toleranceSquared: number,
): Position[] {
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = toleranceSquared;
    for (let i = first + 1; i < last; i++) {
      const distance = segmentDistanceSquared(line[i]!, line[first]!, line[last]!);
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  return line.filter((_, index) => keep[index] === 1);
}

/**
 * Simplifies a closed ring. Douglas-Peucker cannot start from a segment whose
 * ends are the same point, so the ring is split at the position farthest from
 * its start and each half is simplified as an open line. A ring that would
 * collapse below a triangle becomes the widest triangle of its own positions,
 * so small islands stay on the map without their full detail.
 */
export function simplifyRing(
  ring: readonly Position[],
  tolerance: number,
): Position[] {
  if (ring.length <= 4) return [...ring];
  const start = ring[0]!;
  let split = 1;
  let splitDistance = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const distance =
      (ring[i]![0] - start[0]) ** 2 + (ring[i]![1] - start[1]) ** 2;
    if (distance > splitDistance) {
      split = i;
      splitDistance = distance;
    }
  }

  const toleranceSquared = tolerance * tolerance;
  const head = simplifyLine(ring.slice(0, split + 1), toleranceSquared);
  const tail = simplifyLine(ring.slice(split), toleranceSquared);
  const simplified = [...head, ...tail.slice(1)];
  if (simplified.length >= 4) return simplified;

  let apex = 1;
  let apexDistance = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    if (i === split) continue;
    const distance = segmentDistanceSquared(ring[i]!, start, ring[split]!);
    if (distance > apexDistance) {
      apex = i;
      apexDistance = distance;
    }
  }
  // Every position on one line: there is no triangle to keep.
  if (apexDistance <= 0) return [...ring];
  const [first, second] = apex < split ? [apex, split] : [split, apex];
  return [start, ring[first]!, ring[second]!, start];
}

/**
 * Simplifies every ring of every polygon with the same tolerance, then rounds
 * the positions to the given decimals.
 */
export function simplifyPolygons(
  polygons: readonly Polygon[],
  tolerance: number,
  decimals: number,
): Position[][][] {
  return polygons.map((polygon) =>
    polygon.map((ring) => roundRing(simplifyRing(ring, tolerance), decimals)),
  );
}

/**
 * Rounds a ring to a number of decimals and drops the repeated positions that
 * rounding creates. A ring that would collapse below a triangle is kept
 * unrounded; after simplifyRing that is a triangle at most.
 */
export function roundRing(
  ring: readonly Position[],
  decimals: number,
): Position[] {
  const factor = 10 ** decimals;
  const rounded: Position[] = [];
  for (const [longitude, latitude] of ring) {
    const position: Position = [
      Math.round(longitude * factor) / factor,
      Math.round(latitude * factor) / factor,
    ];
    const previous = rounded.at(-1);
    if (previous?.[0] !== position[0] || previous[1] !== position[1]) {
      rounded.push(position);
    }
  }
  return rounded.length >= 4 ? rounded : [...ring];
}
