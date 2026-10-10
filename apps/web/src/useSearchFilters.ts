import { createContext, useContext } from "react";

export interface SearchFiltersValue {
  stateCode: string;
  query: string;
  /** `?uf=SP&q=osasco` or an empty string, ready for a link's `search`. */
  search: string;
  setStateCode: (value: string) => void;
  setQuery: (value: string) => void;
  /** Writes a pending query to the URL now, for example on blur. */
  flush: () => void;
}

export const SearchFiltersContext = createContext<SearchFiltersValue | null>(
  null,
);

/**
 * The map and the list are two views of one search. The filters are held above
 * the routes (see SearchFiltersProvider), so they survive a change of page and
 * every link can carry them.
 */
export function useSearchFilters(): SearchFiltersValue {
  const value = useContext(SearchFiltersContext);
  if (value === null) {
    throw new Error("useSearchFilters needs a SearchFiltersProvider above it.");
  }
  return value;
}
