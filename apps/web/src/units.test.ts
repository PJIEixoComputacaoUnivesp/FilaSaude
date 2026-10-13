import { describe, expect, it } from "vitest";
import { isStateCode } from "./brazilianStates";
import {
  dataOriginNotice,
  filterUnits,
  formatCount,
  hasLocation,
  sortUnits,
  type HealthUnit,
  type UnitsResponse,
} from "./units";

function unit(overrides: {
  id: string;
  name: string;
  city?: string;
  state?: string;
  street?: string | null;
  serviceHours?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): HealthUnit {
  return {
    id: overrides.id,
    name: overrides.name,
    unitType: "PRONTO ATENDIMENTO",
    address: {
      street: overrides.street ?? null,
      number: null,
      district: null,
      postalCode: null,
      city: overrides.city ?? "São Paulo",
      state: overrides.state ?? "SP",
    },
    location: {
      latitude: overrides.latitude === undefined ? -23.5 : overrides.latitude,
      longitude: overrides.longitude === undefined ? -46.6 : overrides.longitude,
      precision: "source",
      referenceMonth: null,
      correctedAt: null,
    },
    serviceHours: overrides.serviceHours ?? null,
    lastUpdatedAt: "2026-09-20",
    sources: [],
  };
}

function metadata(
  overrides: Partial<UnitsResponse["metadata"]>,
): UnitsResponse["metadata"] {
  return {
    count: 1,
    state: "SP",
    dataOrigin: "live",
    isStale: false,
    retrievedAt: "2026-09-21T12:00:00-03:00",
    latestSourceUpdate: "2026-09-20",
    source: { name: "CNES", url: "https://cnes.datasus.gov.br/" },
    ...overrides,
  };
}

describe("filterUnits", () => {
  const units = [
    unit({ id: "1", name: "UPA Vila Mariana", city: "São Paulo" }),
    unit({ id: "2", name: "Pronto Atendimento Osasco", city: "Osasco" }),
    unit({
      id: "3",
      name: "UPA Centro",
      city: "Brasília",
      state: "DF",
      serviceHours: "ATENDIMENTO CONTÍNUO DE 24 HORAS",
    }),
  ];

  it("returns the same list for an empty or blank query", () => {
    expect(filterUnits(units, "")).toBe(units);
    expect(filterUnits(units, "   ")).toBe(units);
  });

  it("ignores accents and letter case in both directions", () => {
    expect(filterUnits(units, "sao paulo").map((u) => u.id)).toEqual(["1"]);
    expect(filterUnits(units, "BRASILIA").map((u) => u.id)).toEqual(["3"]);
    expect(filterUnits(units, "são paulo").map((u) => u.id)).toEqual(["1"]);
  });

  it("matches name and address", () => {
    expect(filterUnits(units, "osasco").map((u) => u.id)).toEqual(["2"]);
    expect(filterUnits(units, "vila mariana").map((u) => u.id)).toEqual(["1"]);
  });

  it("does not match service hours, which the field label does not promise", () => {
    expect(filterUnits(units, "continuo")).toEqual([]);
    expect(filterUnits(units, "24 horas")).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterUnits(units, "inexistente")).toEqual([]);
  });
});

describe("sortUnits", () => {
  it("orders by UF, then city, then name, without changing the input", () => {
    const input = [
      unit({ id: "a", name: "B", city: "Santos", state: "SP" }),
      unit({ id: "b", name: "A", city: "Santos", state: "SP" }),
      unit({ id: "c", name: "Z", city: "Rio Branco", state: "AC" }),
      unit({ id: "d", name: "M", city: "Campinas", state: "SP" }),
    ];
    const snapshot = input.map((u) => u.id);

    expect(sortUnits(input).map((u) => u.id)).toEqual(["c", "d", "b", "a"]);
    expect(input.map((u) => u.id)).toEqual(snapshot);
  });
});

describe("hasLocation", () => {
  it("is false when either coordinate is missing", () => {
    expect(hasLocation(unit({ id: "1", name: "A" }))).toBe(true);
    expect(hasLocation(unit({ id: "2", name: "B", latitude: null }))).toBe(
      false,
    );
    expect(hasLocation(unit({ id: "3", name: "C", longitude: null }))).toBe(
      false,
    );
  });
});

describe("dataOriginNotice", () => {
  it("says nothing for live data", () => {
    expect(dataOriginNotice(metadata({}))).toBeNull();
  });

  it.each(["BR", "ALL"])(
    "treats the national copy (%s) as normal, not as an outage",
    (state) => {
      const notice = dataOriginNotice(
        metadata({ state, isStale: true, dataOrigin: "fallback" }),
      );

      expect(notice?.isOutage).toBe(false);
      expect(notice?.text).toContain("20/09/2026");
      expect(notice?.shortText).toBe("Cópia do CNES de 20/09/2026");
    },
  );

  it("flags a stale single state as an outage of the official source", () => {
    const notice = dataOriginNotice(
      metadata({ state: "SP", isStale: true, dataOrigin: "fallback" }),
    );

    expect(notice?.isOutage).toBe(true);
    expect(notice?.text).toContain("indisponível");
    expect(notice?.shortText).toBeUndefined();
  });

  it("does not write an empty date when the response has no units", () => {
    const national = dataOriginNotice(
      metadata({ state: "BR", isStale: true, latestSourceUpdate: "" }),
    );
    const outage = dataOriginNotice(
      metadata({ state: "SP", isStale: true, latestSourceUpdate: "" }),
    );

    expect(national?.text).toBe("Cópia nacional do CNES.");
    expect(national?.shortText).toBe("Cópia do CNES");
    expect(outage?.text).not.toContain("até");
    expect(outage?.text.endsWith(".")).toBe(true);
  });
});

describe("isStateCode", () => {
  it("accepts only the 27 UF codes", () => {
    expect(isStateCode("SP")).toBe(true);
    expect(isStateCode("DF")).toBe(true);
    expect(isStateCode("ALL")).toBe(false);
    expect(isStateCode("BR")).toBe(false);
    expect(isStateCode("sp")).toBe(false);
    expect(isStateCode("")).toBe(false);
  });
});

describe("formatCount", () => {
  it("uses the singular for one and the pt-BR thousands separator", () => {
    expect(formatCount(1, "unidade encontrada", "unidades encontradas")).toBe(
      "1 unidade encontrada",
    );
    expect(formatCount(0, "unidade encontrada", "unidades encontradas")).toBe(
      "0 unidades encontradas",
    );
    expect(
      formatCount(1793, "unidade encontrada", "unidades encontradas"),
    ).toMatch(/^1\.793 unidades encontradas$/);
  });
});
