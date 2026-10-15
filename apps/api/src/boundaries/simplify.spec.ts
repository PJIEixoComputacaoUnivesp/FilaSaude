import type { Position } from '../units/geometry.js';
import { roundRing, simplifyPolygons, simplifyRing } from './simplify.js';

/** Squared distance from a point to a segment, for checking the tolerance. */
function distanceToSegment(point: Position, start: Position, end: Position) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(start[0] + t * dx - point[0], start[1] + t * dy - point[1]);
}

/** Distance from a point to the closest edge of a closed ring. */
function distanceToRing(point: Position, ring: readonly Position[]) {
  let closest = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    closest = Math.min(closest, distanceToSegment(point, ring[i]!, ring[i + 1]!));
  }
  return closest;
}

// A 10-degree square whose bottom edge has small bumps and collinear points.
const bumpySquare: Position[] = [
  [0, 0],
  [2, 0.001],
  [4, 0],
  [6, -0.001],
  [8, 0],
  [10, 0],
  [10, 5],
  [10, 10],
  [5, 10],
  [0, 10],
  [0, 5],
  [0, 0],
];

describe('simplifyRing', () => {
  it('drops points within the tolerance and keeps the corners', () => {
    expect(simplifyRing(bumpySquare, 0.01)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
  });

  it('keeps every dropped point within the tolerance of the result', () => {
    const tolerance = 0.01;
    const simplified = simplifyRing(bumpySquare, tolerance);

    for (const point of bumpySquare) {
      expect(distanceToRing(point, simplified)).toBeLessThanOrEqual(tolerance);
    }
  });

  it('keeps a point farther than the tolerance', () => {
    expect(simplifyRing(bumpySquare, 0.0005)).toContainEqual([2, 0.001]);
  });

  it('keeps a ring that would collapse below a triangle', () => {
    const islet: Position[] = [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0.0005, 0.0015],
      [0, 0.001],
      [0, 0],
    ];

    expect(simplifyRing(islet, 0.01)).toEqual(islet);
  });
});

describe('simplifyPolygons', () => {
  it('returns closed rings with at least four positions', () => {
    const hole: Position[] = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ];

    const [polygon] = simplifyPolygons([[bumpySquare, hole]], 0.01, 3);

    expect(polygon).toHaveLength(2);
    for (const ring of polygon!) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring.at(-1)).toEqual(ring[0]);
    }
  });
});

describe('roundRing', () => {
  it('rounds the positions and drops the repeats it creates', () => {
    expect(
      roundRing(
        [
          [0.1234, 0.1],
          [0.1231, 0.1001],
          [1.2, 0.1],
          [1.2, 1.2],
          [0.1234, 0.1],
        ],
        3,
      ),
    ).toEqual([
      [0.123, 0.1],
      [1.2, 0.1],
      [1.2, 1.2],
      [0.123, 0.1],
    ]);
  });

  it('keeps a ring that rounding would collapse', () => {
    const islet: Position[] = [
      [0, 0],
      [0.0001, 0],
      [0.0001, 0.0001],
      [0, 0],
    ];

    expect(roundRing(islet, 3)).toEqual(islet);
  });
});
