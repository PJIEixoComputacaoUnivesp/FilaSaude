import { describe, expect, it } from "vitest";
import { directionsLink, directionsTarget } from "./directions";
import type { HealthUnit } from "./units";

function unit(
  precision: HealthUnit["location"]["precision"],
  latitude: number | null = -23.5505,
  longitude: number | null = -46.6333,
): HealthUnit {
  return {
    id: "1234567",
    name: "UPA Vila Mariana",
    unitType: "PRONTO ATENDIMENTO",
    address: {
      street: "Rua Domingos de Morais",
      number: "100",
      district: "Vila Mariana",
      postalCode: null,
      city: "São Paulo",
      state: "SP",
    },
    location: {
      latitude,
      longitude,
      precision,
      referenceMonth: null,
      correctedAt: null,
    },
    serviceHours: null,
    lastUpdatedAt: "2026-09-20",
    sources: [],
  };
}

describe("directionsTarget", () => {
  it("uses geo: links only on Android", () => {
    expect(
      directionsTarget("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130"),
    ).toBe("android");
    expect(
      directionsTarget("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"),
    ).toBe("web");
    expect(directionsTarget("Mozilla/5.0 (X11; Linux x86_64)")).toBe("web");
  });
});

describe("directionsLink", () => {
  it("routes to the point, with the unit's name, on Android", () => {
    const web = directionsLink(unit("source"), "web");
    expect(directionsLink(unit("source"), "android")).toBe(
      "intent:-23.5505,-46.6333?q=-23.5505,-46.6333(UPA%20Vila%20Mariana)" +
        `#Intent;scheme=geo;S.browser_fallback_url=${encodeURIComponent(web)};end`,
    );
  });

  it("escapes parentheses, which geo: reads as the label", () => {
    const named = { ...unit("source"), name: "UPA 24h (Zona Norte)" };
    expect(directionsLink(named, "android")).toMatch(
      /^intent:-23\.5505,-46\.6333\?q=-23\.5505,-46\.6333\(UPA%2024h%20%28Zona%20Norte%29\)#Intent;/,
    );
    const approximate = { ...unit("municipality"), name: "PA (Centro)" };
    const geo = directionsLink(approximate, "android").split("#Intent")[0];
    expect(geo).not.toMatch(/[()]/);
  });

  it("routes to the point on Google Maps elsewhere, with no origin", () => {
    const link = new URL(directionsLink(unit("manual"), "web"));
    expect(link.origin + link.pathname).toBe(
      "https://www.google.com/maps/dir/",
    );
    expect(link.searchParams.get("api")).toBe("1");
    expect(link.searchParams.get("destination")).toBe("-23.5505,-46.6333");
    expect(link.searchParams.has("origin")).toBe(false);
  });

  it("searches by name and address when the point is the municipality", () => {
    const address =
      "UPA Vila Mariana, Rua Domingos de Morais, 100, Vila Mariana, São Paulo - SP";
    expect(
      directionsLink(unit("municipality"), "android").startsWith(
        `intent:0,0?q=${encodeURIComponent(address)}#Intent;scheme=geo;`,
      ),
    ).toBe(true);
    expect(
      new URL(directionsLink(unit("municipality"), "web")).searchParams.get(
        "destination",
      ),
    ).toBe(address);
    expect(
      new URL(directionsLink(unit("source", null, null), "web")).searchParams.get(
        "destination",
      ),
    ).toBe(address);
  });
});
