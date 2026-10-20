import { describe, expect, it } from "vitest";
import {
  calculateDistanceKm,
  distancesFrom,
  formatDistanceKm,
  sortByDistance,
} from "./geo";
import type { HealthUnit } from "./units";

function unit(
  id: string,
  latitude: number | null,
  longitude: number | null,
): HealthUnit {
  return {
    id,
    name: `Unidade ${id}`,
    unitType: "PRONTO ATENDIMENTO",
    address: {
      street: null,
      number: null,
      district: null,
      postalCode: null,
      city: "São Paulo",
      state: "SP",
    },
    location: {
      latitude,
      longitude,
      precision: "source",
      referenceMonth: null,
      correctedAt: null,
    },
    serviceHours: null,
    lastUpdatedAt: "2026-09-20",
    sources: [],
  };
}

const saoPauloCenter = { latitude: -23.5505, longitude: -46.6333 };

describe("calculateDistanceKm", () => {
  it("is zero for the same point", () => {
    expect(calculateDistanceKm(saoPauloCenter, saoPauloCenter)).toBe(0);
  });

  it("measures the straight line between two cities", () => {
    const rioDeJaneiro = { latitude: -22.9068, longitude: -43.1729 };
    expect(calculateDistanceKm(saoPauloCenter, rioDeJaneiro)).toBeCloseTo(361, 0);
  });
});

describe("formatDistanceKm", () => {
  it.each([
    [0.2, "menos de 0,5 km"],
    [0.6, "≈ 0,5 km"],
    [3.4, "≈ 3,5 km"],
    [4.1, "≈ 4 km"],
    [12.4, "≈ 12 km"],
    [1234.6, "≈ 1.235 km"],
  ])("rounds %s km to %s", (km, text) => {
    expect(formatDistanceKm(km)).toBe(text);
  });
});

describe("sortByDistance", () => {
  it("puts the nearest first and units without a position last, in order", () => {
    const units = [
      unit("far", -22.9068, -43.1729),
      unit("unknown-1", null, null),
      unit("near", -23.5614, -46.6559),
      unit("unknown-2", null, null),
    ];
    const distances = distancesFrom(saoPauloCenter, units);
    expect(distances.has("unknown-1")).toBe(false);
    expect(sortByDistance(units, distances).map(({ id }) => id)).toEqual([
      "near",
      "far",
      "unknown-1",
      "unknown-2",
    ]);
  });

  it("does not change the list it receives", () => {
    const units = [unit("far", -22.9, -43.17), unit("near", -23.56, -46.65)];
    sortByDistance(units, distancesFrom(saoPauloCenter, units));
    expect(units.map(({ id }) => id)).toEqual(["far", "near"]);
  });
});
