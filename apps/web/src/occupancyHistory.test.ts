import { describe, expect, it } from "vitest";
import type { OccupancyHistoryPoint } from "./occupancy";
import { chartSegments, hourlyHistory } from "./occupancyHistory";

function point(
  occurredAt: string,
  percentage: number | null,
): OccupancyHistoryPoint {
  return {
    percentage,
    level: percentage === null ? null : "low",
    categories: [],
    occurredAt,
    observedAt: occurredAt,
  };
}

describe("hourlyHistory", () => {
  it("keeps the last snapshot of each hour, newest first", () => {
    const rows = hourlyHistory([
      point("2026-10-15T10:05:00.000Z", 10),
      point("2026-10-15T10:55:00.000Z", 20),
      point("2026-10-15T11:10:00.000Z", 30),
    ]);

    expect(rows.map((row) => row.percentage)).toEqual([30, 20]);
  });
});

describe("chartSegments", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");

  it("places time on x across the period and 0% at the bottom", () => {
    const [segment] = chartSegments(
      [
        point("2026-10-15T00:00:00.000Z", 0),
        point("2026-10-15T12:00:00.000Z", 100),
      ],
      now,
      12,
      100,
      50,
    );

    expect(segment).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 0 },
    ]);
  });

  it("breaks the line where the percentage is not informed", () => {
    const segments = chartSegments(
      [
        point("2026-10-15T09:00:00.000Z", 40),
        point("2026-10-15T10:00:00.000Z", null),
        point("2026-10-15T11:00:00.000Z", 50),
      ],
      now,
      12,
      100,
      50,
    );

    expect(segments).toHaveLength(2);
  });
});
