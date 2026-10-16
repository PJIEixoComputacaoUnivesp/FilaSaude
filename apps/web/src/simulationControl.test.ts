import { afterEach, describe, expect, it, vi } from "vitest";
import { changeSimulationScenario, parseSimulationControl } from "./occupancy";

const body = {
  data: {
    scenario: "surge",
    changedAt: "2026-10-15T15:00:00.000Z",
    expiresAt: "2026-10-15T15:15:00.000Z",
    nextChangeAt: null,
    scenarios: [
      { id: "showcase", label: "Demonstração completa", description: "…" },
      { id: "surge", label: "Pico de ocupação", description: "…" },
    ],
  },
  metadata: { simulated: true, defaultScenario: "showcase" },
};

describe("parseSimulationControl", () => {
  it("reads the scenario and its options", () => {
    expect(parseSimulationControl(body)).toMatchObject({
      scenario: "surge",
      expiresAt: "2026-10-15T15:15:00.000Z",
      defaultScenario: "showcase",
    });
  });

  it("rejects a response without the simulation mark", () => {
    expect(() =>
      parseSimulationControl({
        ...body,
        metadata: { ...body.metadata, simulated: false },
      }),
    ).toThrow();
  });
});

describe("changeSimulationScenario", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the chosen scenario", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const result = await changeSimulationScenario("surge");

    expect(result.status).toBe("changed");
    expect(fetch).toHaveBeenCalledWith(
      "/api/occupancy/simulation",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ scenario: "surge" }),
      }),
    );
  });

  it("reports the cooldown with the time to wait", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("{}", { status: 429, headers: { "Retry-After": "9" } }),
        ),
    );

    await expect(changeSimulationScenario("normal")).resolves.toEqual({
      status: "cooldown",
      retryAfterSeconds: 9,
    });
  });

  it("turns an unreadable or unexpected body into an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(changeSimulationScenario("normal")).resolves.toMatchObject({
      status: "error",
    });
    await expect(changeSimulationScenario("normal")).resolves.toMatchObject({
      status: "error",
    });
  });

  it("turns a network failure into a message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(changeSimulationScenario("normal")).resolves.toMatchObject({
      status: "error",
    });
  });
});
