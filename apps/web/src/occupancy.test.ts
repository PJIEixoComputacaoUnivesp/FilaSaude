import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeOccupancy,
  fetchOccupancy,
  formatDateTime,
  occupancyStatus,
  parseOccupancyResponse,
  STATUS_COLORS,
  type UnitOccupancy,
} from "./occupancy";

function occupancy(overrides: Partial<UnitOccupancy> = {}): UnitOccupancy {
  return {
    unitCnes: "1234567",
    percentage: 90,
    level: "high",
    confirmation: "recent",
    categories: [{ code: "observation", capacity: 20, occupied: 18 }],
    occurredAt: "2026-10-15T15:00:00.000Z",
    observedAt: "2026-10-15T15:00:01.000Z",
    receivedAt: "2026-10-15T15:00:02.000Z",
    ...overrides,
  };
}

const metadata = {
  simulated: true,
  source: { name: "Simulador", description: "Dados sintéticos" },
  generatedAt: "2026-10-15T15:01:00.000Z",
  staleAfterMinutes: 20,
};

describe("occupancyStatus", () => {
  it("uses the level while the source confirms, and stale after that", () => {
    expect(occupancyStatus(occupancy())).toBe("high");
    expect(occupancyStatus(occupancy({ level: null, percentage: null }))).toBe(
      "unknown",
    );
    expect(
      occupancyStatus(occupancy({ level: null, confirmation: "stale" })),
    ).toBe("stale");
  });
});

describe("describeOccupancy", () => {
  it("says the level and the percentage in words", () => {
    expect(describeOccupancy(occupancy())).toBe("Ocupação alta (90%)");
  });

  it("drops the percentage when the level is not shown", () => {
    expect(
      describeOccupancy(occupancy({ level: null, confirmation: "stale" })),
    ).toBe("Sem confirmação recente");
    expect(
      describeOccupancy(occupancy({ level: null, percentage: null })),
    ).toBe("Ocupação não informada");
  });
});

describe("STATUS_COLORS", () => {
  it("never reuses the colors of clinical risk classification", () => {
    const clinical = ["#ff0000", "#ffa500", "#ffff00", "#008000", "#0000ff"];
    for (const { fill } of Object.values(STATUS_COLORS)) {
      expect(clinical).not.toContain(fill);
    }
  });
});

describe("parseOccupancyResponse", () => {
  it("accepts a response marked as simulation", () => {
    const response = { data: [occupancy()], metadata };
    expect(parseOccupancyResponse(response)).toEqual(response);
  });

  it("rejects operational data without the simulation mark", () => {
    expect(() =>
      parseOccupancyResponse({
        data: [occupancy()],
        metadata: { ...metadata, simulated: false },
      }),
    ).toThrow();
  });

  it("rejects unknown categories and levels", () => {
    expect(() =>
      parseOccupancyResponse({
        data: [
          occupancy({
            categories: [{ code: "icu" as never, capacity: 1, occupied: 1 }],
          }),
        ],
        metadata,
      }),
    ).toThrow();
    expect(() =>
      parseOccupancyResponse({
        data: [occupancy({ level: "critical" as never })],
        metadata,
      }),
    ).toThrow();
  });
});

describe("fetchOccupancy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports a server with the demonstration off as null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(fetchOccupancy()).resolves.toBeNull();
  });

  it("fails on other errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(fetchOccupancy()).rejects.toThrow(/ocupação simulada/);
  });
});

describe("formatDateTime", () => {
  it("shows Brasília time", () => {
    expect(formatDateTime("2026-10-15T15:00:00.000Z")).toBe("15/10 às 12:00");
  });
});
