import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeOccupancy,
  fetchOccupancy,
  waitingStatus,
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
  it("does not use occupied beds as a fallback for missing waiting data", () => {
    expect(occupancyStatus(occupancy())).toBe("unknown");
    expect(occupancyStatus(occupancy({ percentage: 100, level: "high" }))).toBe(
      "unknown",
    );
  });

  it("uses only the queue even when beds set a higher aggregate level", () => {
    expect(
      occupancyStatus(
        occupancy({
          indicators: { beds: "high", waiting: "low" },
          levelDrivers: ["beds"],
          attendance: { waiting: 0, serviceSlots: 4, inService: 4 },
        }),
      ),
    ).toBe("low");
    expect(
      occupancyStatus(
        occupancy({
          percentage: 0,
          level: "low",
          attendance: { waiting: 12, serviceSlots: 4 },
        }),
      ),
    ).toBe("high");
  });

  it("hides the queue level when the source is stale", () => {
    expect(
      occupancyStatus(
        occupancy({
          confirmation: "stale",
          attendance: { waiting: 12, serviceSlots: 4 },
        }),
      ),
    ).toBe("stale");
  });
});

describe("describeOccupancy", () => {
  it("describes the queue without the bed percentage or aggregate drivers", () => {
    expect(
      describeOccupancy(
        occupancy({
          levelDrivers: ["beds", "waiting"],
          attendance: { waiting: 7, serviceSlots: 2 },
        }),
      ),
    ).toBe("Espera alta, 3,5 por posto");
    expect(
      describeOccupancy(
        occupancy({
          attendance: { waiting: 0, serviceSlots: 4 },
        }),
      ),
    ).toBe("Espera baixa, 0 por posto");
  });

  it("makes missing and stale data explicit", () => {
    expect(describeOccupancy(occupancy())).toBe("Espera não informada");
    expect(describeOccupancy(occupancy({ confirmation: "stale" }))).toBe(
      "Sem confirmação recente",
    );
  });
});

describe("waitingStatus", () => {
  it.each([
    [0, "low"],
    [0.99, "low"],
    [1, "moderate"],
    [2.99, "moderate"],
    [3, "high"],
    [10, "high"],
  ] as const)("classifies %s people per active slot as %s", (ratio, status) => {
    expect(waitingStatus({ waiting: ratio * 100, serviceSlots: 100 })).toBe(
      status,
    );
  });

  it.each([
    undefined,
    null,
    {},
    { waiting: 0 },
    { serviceSlots: 2 },
    { waiting: 5, serviceSlots: 0 },
    { waiting: 0, serviceSlots: 0 },
  ])("does not classify incomplete data: %s", (attendance) => {
    expect(waitingStatus(attendance)).toBe("unknown");
  });
});

describe("waitingPerSlot", () => {
  it("needs both the waiting count and the active slots", () => {
    expect(waitingPerSlot({ waiting: 6, serviceSlots: 4 })).toBe(1.5);
    expect(waitingPerSlot({ waiting: 0, serviceSlots: 4 })).toBe(0);
    expect(waitingPerSlot({ waiting: 6 })).toBeNull();
    expect(waitingPerSlot(null)).toBeNull();
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
    expect(() =>
      parseOccupancyResponse({
        data: [
          occupancy({
            attendance: {
              completed: { count: -5, periodStart: "x", periodEnd: "y" },
            },
          }),
        ],
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
