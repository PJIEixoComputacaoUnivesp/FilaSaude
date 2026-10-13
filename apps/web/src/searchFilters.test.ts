import { describe, expect, it } from "vitest";
import {
  buildSearch,
  createOwnWriteTracker,
  readFilters,
  sameFilters,
} from "./searchFilters";

const all = (query: string) => ({ stateCode: "ALL", query });

describe("readFilters", () => {
  it("reads uf and q", () => {
    expect(readFilters(new URLSearchParams("uf=SP&q=osasco"))).toEqual({
      stateCode: "SP",
      query: "osasco",
    });
  });

  it("uppercases the uf and falls back to the whole country", () => {
    expect(readFilters(new URLSearchParams("uf=sp")).stateCode).toBe("SP");
    expect(readFilters(new URLSearchParams("uf=XX")).stateCode).toBe("ALL");
    expect(readFilters(new URLSearchParams("")).stateCode).toBe("ALL");
    expect(readFilters(new URLSearchParams("")).query).toBe("");
  });
});

describe("buildSearch", () => {
  it("is empty at the defaults", () => {
    expect(buildSearch({ stateCode: "ALL", query: "" })).toBe("");
  });

  it("writes only what differs from the defaults", () => {
    expect(buildSearch({ stateCode: "SP", query: "" })).toBe("?uf=SP");
    expect(buildSearch(all("osasco"))).toBe("?q=osasco");
    expect(buildSearch({ stateCode: "SP", query: "vila mariana" })).toBe(
      "?uf=SP&q=vila+mariana",
    );
  });

  it("round-trips through readFilters", () => {
    const filters = { stateCode: "RJ", query: "são & cia" };
    const search = buildSearch(filters);

    expect(readFilters(new URLSearchParams(search))).toEqual(filters);
  });
});

describe("createOwnWriteTracker", () => {
  it("recognizes the initial URL, once", () => {
    const tracker = createOwnWriteTracker(all(""));

    expect(tracker.arrived(all(""))).toBe(true);
    expect(tracker.arrived(all(""))).toBe(false);
  });

  it("recognizes own writes arriving in order", () => {
    const tracker = createOwnWriteTracker(all(""));
    tracker.arrived(all(""));
    tracker.wrote(all("a"));
    tracker.wrote(all("ab"));

    expect(tracker.arrived(all("a"))).toBe(true);
    expect(tracker.arrived(all("ab"))).toBe(true);
  });

  it("recognizes a late arrival of an older write while a newer one is in flight", () => {
    const tracker = createOwnWriteTracker(all(""));
    tracker.arrived(all(""));
    tracker.wrote(all("a"));
    tracker.wrote(all("ab"));

    // The router skipped "a" and applied "ab" directly, or "a" arrives late:
    // neither is an outside change.
    expect(tracker.arrived(all("a"))).toBe(true);
    expect(tracker.arrived(all("ab"))).toBe(true);
  });

  it("drops older writes when a newer one arrives first", () => {
    const tracker = createOwnWriteTracker(all(""));
    tracker.arrived(all(""));
    tracker.wrote(all("a"));
    tracker.wrote(all("ab"));

    expect(tracker.arrived(all("ab"))).toBe(true);
    expect(tracker.arrived(all("a"))).toBe(false);
  });

  it("treats a value it never wrote as an outside change", () => {
    const tracker = createOwnWriteTracker(all("osasco"));
    tracker.arrived(all("osasco"));
    tracker.wrote(all("osasco "));

    expect(tracker.arrived(all(""))).toBe(false);
  });

  it("forgets what is in flight after an outside change", () => {
    const tracker = createOwnWriteTracker(all(""));
    tracker.arrived(all(""));
    tracker.wrote(all("a"));
    tracker.reset();

    expect(tracker.arrived(all("a"))).toBe(false);
  });
});

describe("sameFilters", () => {
  it("compares both fields", () => {
    expect(sameFilters(all("a"), all("a"))).toBe(true);
    expect(sameFilters(all("a"), { stateCode: "SP", query: "a" })).toBe(false);
    expect(sameFilters(all("a"), all("b"))).toBe(false);
  });
});
