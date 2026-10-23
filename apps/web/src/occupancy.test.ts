import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeOccupancy,
  fetchOccupancy,
  levelDrivers,
  waitingPerSlot,
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
  it("says the level and the bed percentage of older responses", () => {
    expect(describeOccupancy(occupancy())).toBe(
      "Situação alta, por leitos 90%",
    );
  });

  it("names the indicators that set the level", () => {
    expect(
      describeOccupancy(
        occupancy({
          percentage: 40,
          indicators: { beds: "low", waiting: "high" },
          levelDrivers: ["waiting"],
          attendance: { waiting: 7, serviceSlots: 2 },
        }),
      ),
    ).toBe("Situação alta, por espera 3,5 por posto");
    expect(
      describeOccupancy(
        occupancy({
          levelDrivers: ["beds", "waiting"],
          attendance: { waiting: 12, serviceSlots: 4 },
        }),
      ),
    ).toBe("Situação alta, por leitos 90% e espera 3 por posto");
  });

  it("drops the percentage when the level is not shown", () => {
    expect(
      describeOccupancy(occupancy({ level: null, confirmation: "stale" })),
    ).toBe("Sem confirmação recente");
    expect(
      describeOccupancy(occupancy({ level: null, percentage: null })),
    ).toBe("Situação não informada");
  });
});

describe("waitingPerSlot", () => {
  it("needs both the waiting count and the active slots", () => {
    expect(waitingPerSlot({ waiting: 6, serviceSlots: 4 })).toBe(1.5);
    expect(waitingPerSlot({ waiting: 0, serviceSlots: 4 })).toBe(0);
    expect(waitingPerSlot({ waiting: 6 })).toBeNull();
    expect(waitingPerSlot(null)).toBeNull();
  });

  it("falls back to the beds only when the response has no drivers", () => {
    expect(levelDrivers(occupancy())).toEqual(["beds"]);
    expect(levelDrivers(occupancy({ level: null }))).toEqual([]);
  });
});

describe("STATUS_COLORS", () => {
  it("uses green, yellow and red with one dark ring for the levels", () => {
    expect(STATUS_COLORS.low.fill).toBe("#16a34a");
    expect(STATUS_COLORS.moderate.fill).toBe("#facc15");
    expect(STATUS_COLORS.high.fill).toBe("#991b1b");
    const rings = new Set(
      (["low", "moderate", "high"] as const).map(
        (level) => STATUS_COLORS[level].stroke,
      ),
    );
    expect([...rings]).toEqual(["#0f172a"]);
  });
});

describe("parseOccupancyResponse", () => {
  it("accepts a response marked as simulation", () => {
    const response = { data: [occupancy()], metadata };
    expect(parseOccupancyResponse(response)).toEqual(response);
  });

  it("accepts the attendance flow and rejects negative counts", () => {
    const attendance = {
      waiting: 3,
      inService: 2,
      serviceSlots: 4,
      completed: {
        count: 10,
        periodStart: "2026-10-15T00:00:00-03:00",
        periodEnd: "2026-10-16T00:00:00-03:00",
      },
    };
    const response = { data: [occupancy({ attendance })], metadata };
    expect(parseOccupancyResponse(response)).toEqual(response);
    expect(() =>
      parseOccupancyResponse({
        data: [occupancy({ attendance: { waiting: -1 } })],
        metadata,
      }),
    ).toThrow();
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
