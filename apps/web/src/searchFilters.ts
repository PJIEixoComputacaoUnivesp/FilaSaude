import { isStateCode, NationalStateCode } from "./brazilianStates";

export interface Filters {
  stateCode: string;
  query: string;
}

/** Reads `uf` and `q`; a missing or unknown `uf` means the whole country. */
export function readFilters(params: URLSearchParams): Filters {
  const requestedState = params.get("uf")?.toUpperCase() ?? "";

  return {
    stateCode: isStateCode(requestedState)
      ? requestedState
      : NationalStateCode.All,
    query: params.get("q") ?? "",
  };
}

/** `?uf=SP&q=osasco`, or an empty string when both are at their defaults. */
export function buildSearch(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.stateCode !== NationalStateCode.All) {
    params.set("uf", filters.stateCode);
  }
  if (filters.query !== "") params.set("q", filters.query);

  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return a.stateCode === b.stateCode && a.query === b.query;
}

/**
 * Tells this page's own URL writes apart from changes made from outside (a
 * link, the back button). The router applies a write some time after it is
 * made, and several writes can be in flight, so a single "last written" value
 * is not enough: a late arrival of an older write would look external.
 */
export function createOwnWriteTracker(initial: Filters) {
  let pending: Filters[] = [initial];

  return {
    /** Records a value that is about to be written to the URL. */
    wrote(filters: Filters): void {
      pending.push(filters);
    },
    /**
     * True when the URL now holds one of the recorded writes. That write and
     * the older ones are dropped, since the router never goes back to them.
     */
    arrived(filters: Filters): boolean {
      const index = pending.findIndex((entry) => sameFilters(entry, filters));
      if (index === -1) return false;
      pending = pending.slice(index + 1);
      return true;
    },
    /** Forgets what is in flight, after an outside change was adopted. */
    reset(): void {
      pending = [];
    },
  };
}
