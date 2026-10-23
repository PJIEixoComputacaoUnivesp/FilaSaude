import { describe, expect, it, vi } from "vitest";
import {
  expireOccupancy,
  mergeOccupancy,
  subscribeOccupancy,
} from "./occupancyStream";
import type { OccupancyResponse } from "./occupancy";

const response: OccupancyResponse = {
  data: [
    {
      unitCnes: "1234567",
      percentage: 90,
      level: "high",
      confirmation: "recent",
      categories: [],
      occurredAt: "2026-10-16T12:00:00Z",
      observedAt: "2026-10-16T12:00:00Z",
      receivedAt: "2026-10-16T12:00:01Z",
    },
  ],
  metadata: {
    simulated: true,
    generatedAt: "2026-10-16T12:00:02Z",
    staleAfterMinutes: 20,
    source: { name: "Simulador", description: "Dados sintéticos" },
  },
};

function fixture(load = vi.fn().mockResolvedValue(response)) {
  const source = new EventTarget();
  const close = vi.fn();
  const callbacks = { onResponse: vi.fn(), onDelta: vi.fn(), onError: vi.fn() };
  const unsubscribe = subscribeOccupancy(callbacks, {
    load,
    createSource: () =>
      Object.assign(source, { close }) as unknown as EventSource,
  });
  return { source, close, load, callbacks, unsubscribe };
}

describe("subscribeOccupancy", () => {
  it("uses SSE to refresh and rebuilds the snapshot on every reconnect", async () => {
    const { source, load, callbacks, unsubscribe, close } = fixture();
    try {
      expect(load).not.toHaveBeenCalled();
      source.dispatchEvent(new Event("open"));
      await vi.waitFor(() =>
        expect(callbacks.onResponse).toHaveBeenCalledWith(response),
      );
      source.dispatchEvent(new Event("error"));
      expect(callbacks.onError).toHaveBeenCalledOnce();
      source.dispatchEvent(new Event("open"));
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      source.dispatchEvent(
        new MessageEvent("occupancy.updated", {
          data: JSON.stringify(response),
        }),
      );
      await vi.waitFor(() =>
        expect(callbacks.onDelta).toHaveBeenCalledWith(response),
      );
      source.dispatchEvent(new Event("heartbeat"));
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
    expect(close).toHaveBeenCalledOnce();
  });

  it("coalesces notifications during a slow request without losing the newest update", async () => {
    let resolveFirst!: (value: OccupancyResponse) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<OccupancyResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(response);
    const { source, callbacks, unsubscribe } = fixture(load);
    try {
      source.dispatchEvent(new Event("open"));
      for (let index = 0; index < 10; index++)
        source.dispatchEvent(
          new MessageEvent("occupancy.updated", {
            data: JSON.stringify({
              ...response,
              data: [{ ...response.data[0], percentage: 95 }],
            }),
          }),
        );
      expect(load).toHaveBeenCalledTimes(1);
      expect(callbacks.onDelta).not.toHaveBeenCalled();
      resolveFirst(response);
      await vi.waitFor(() => expect(callbacks.onDelta).toHaveBeenCalledOnce());
      expect(callbacks.onResponse).toHaveBeenCalledOnce();
      expect(callbacks.onDelta.mock.calls[0][0].data[0].percentage).toBe(95);
      expect(callbacks.onDelta.mock.invocationCallOrder[0]).toBeGreaterThan(
        callbacks.onResponse.mock.invocationCallOrder[0],
      );
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("ignores in-flight responses after closing the layer", async () => {
    let finish!: (value: OccupancyResponse) => void;
    const load = vi.fn().mockImplementation(
      () =>
        new Promise<OccupancyResponse>((resolve) => {
          finish = resolve;
        }),
    );
    const { source, callbacks, unsubscribe } = fixture(load);
    source.dispatchEvent(new Event("open"));
    unsubscribe();
    finish(response);
    await Promise.resolve();
    expect(callbacks.onResponse).not.toHaveBeenCalled();
    expect(load.mock.calls[0][0].aborted).toBe(true);
  });
});

describe("expireOccupancy", () => {
  it("expires confirmations even without new source events, keeping the last percentage", () => {
    expect(expireOccupancy(response, Date.parse("2026-10-16T12:19:00Z"))).toBe(
      response,
    );
    const expired = expireOccupancy(
      response,
      Date.parse("2026-10-16T12:21:00Z"),
    );
    expect(expired.data[0]).toMatchObject({
      confirmation: "stale",
      level: null,
      percentage: 90,
      indicators: { beds: null, waiting: null },
      levelDrivers: [],
    });
    expect(response.data[0].confirmation).toBe("recent");
  });
});

describe("mergeOccupancy", () => {
  it("replaces changed units without losing the rest of the national snapshot", () => {
    const another = {
      ...response.data[0],
      unitCnes: "7654321",
      percentage: 20,
    };
    const current = { ...response, data: [...response.data, another] };
    const delta = {
      ...response,
      data: [{ ...response.data[0], percentage: 95 }],
    };
    const merged = mergeOccupancy(current, delta);
    expect(merged.data.map((unit) => unit.percentage)).toEqual([95, 20]);
    expect(merged.data[1]).toBe(another);
    expect(current.data[0].percentage).toBe(90);
  });
});

describe("SSE version ordering", () => {
  it("does not roll a newer REST snapshot back when a buffered delta is older", () => {
    const latest = {
      ...response,
      data: [
        {
          ...response.data[0],
          receivedAt: "2026-10-16T12:01:00Z",
          percentage: 95,
        },
      ],
    };
    expect(mergeOccupancy(latest, response).data[0].percentage).toBe(95);
  });
  it("uses the event ID to break timestamp ties like the database", () => {
    const latest = {
      ...response,
      data: [{ ...response.data[0], eventId: "EVENT_B", percentage: 95 }],
    };
    const older = {
      ...response,
      data: [{ ...response.data[0], eventId: "EVENT_A", percentage: 90 }],
    };
    expect(mergeOccupancy(latest, older).data[0].percentage).toBe(95);
  });
});
