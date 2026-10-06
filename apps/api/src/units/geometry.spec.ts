import { centerOfArea, distanceToAreaKm, type Polygon } from './geometry.js';

const square = (west: number, south: number, size: number): Polygon => [
  [
    [west, south],
    [west + size, south],
    [west + size, south + size],
    [west, south + size],
    [west, south],
  ],
];

// A 10-degree square with a 2-degree hole in the middle.
const withHole: Polygon = [
  ...square(0, 0, 10),
  [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ],
];

const at = (latitude: number, longitude: number) => ({ latitude, longitude });

describe('distanceToAreaKm', () => {
  it('is zero for a point inside the area', () => {
    expect(distanceToAreaKm([square(0, 0, 10)], at(5, 5))).toBe(0);
  });

  it('measures the distance to the closest edge from outside', () => {
    // One degree of latitude is about 111 km.
    expect(distanceToAreaKm([square(0, 0, 10)], at(-1, 5))).toBeCloseTo(
      111.2,
      0,
    );
  });

  it('is zero inside any polygon of a multipolygon area', () => {
    const area = [square(0, 0, 1), square(10, 10, 4)];

    expect(distanceToAreaKm(area, at(0.5, 0.5))).toBe(0);
    expect(distanceToAreaKm(area, at(12, 12))).toBe(0);
  });

  it('measures from the closest polygon of a multipolygon area', () => {
    const area = [square(0, 0, 1), square(10, 10, 4)];

    // Half a degree east of the small square, far from the large one.
    expect(distanceToAreaKm(area, at(0.5, 1.5))).toBeCloseTo(55.6, 0);
  });

  it('treats a point inside a hole as outside, measured to the hole edge', () => {
    const distance = distanceToAreaKm([withHole], at(5, 5));

    // One degree to the hole edge, not zero and not the distance to the border.
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(115);
  });
});

describe('centerOfArea', () => {
  it('is the centroid of a convex polygon', () => {
    const { latitude, longitude } = centerOfArea([square(0, 0, 10)]);

    expect(latitude).toBeCloseTo(5, 6);
    expect(longitude).toBeCloseTo(5, 6);
  });

  it('is taken from the largest polygon of a multipolygon area', () => {
    const { latitude, longitude } = centerOfArea([
      square(0, 0, 1),
      square(10, 10, 4),
      square(30, 30, 2),
    ]);

    expect(latitude).toBeCloseTo(12, 6);
    expect(longitude).toBeCloseTo(12, 6);
  });

  it('stays inside the area when the centroid falls in a hole', () => {
    const center = centerOfArea([withHole]);

    expect(distanceToAreaKm([withHole], center)).toBe(0);
  });

  it('returns a finite coordinate for a ring with no area', () => {
    // A sliver collapsed to a line has no centroid.
    const sliver: Polygon = [
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [0, 0],
      ],
    ];
    const { latitude, longitude } = centerOfArea([sliver]);

    expect(Number.isFinite(latitude)).toBe(true);
    expect(Number.isFinite(longitude)).toBe(true);
  });

  it('stays inside a concave polygon whose centroid is outside it', () => {
    const lShape: Polygon = [
      [
        [0, 0],
        [10, 0],
        [10, 1],
        [1, 1],
        [1, 10],
        [0, 10],
        [0, 0],
      ],
    ];

    expect(distanceToAreaKm([lShape], centerOfArea([lShape]))).toBe(0);
  });
});
