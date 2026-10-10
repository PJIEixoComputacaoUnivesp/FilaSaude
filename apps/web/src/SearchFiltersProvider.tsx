import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  buildSearch,
  createOwnWriteTracker,
  readFilters,
  sameFilters,
  type Filters,
} from "./searchFilters";
import {
  SearchFiltersContext,
  type SearchFiltersValue,
} from "./useSearchFilters";
import { NationalStateCode } from "./brazilianStates";

// Browsers limit history.replaceState (Safari throws after 100 calls in 30
// seconds), so the typed text reaches the URL once typing pauses.
const QUERY_WRITE_DELAY_MS = 300;

// Pages that show the filters. Other pages keep them without touching the URL.
const FILTER_ROUTES = new Set(["/", "/units"]);

/**
 * Holds the search filters for the whole app and mirrors them to the URL
 * (`?uf=SP&q=osasco`).
 *
 * The state is the source during use, so fields answer at once and links can
 * carry the search even before the URL catches up. The URL is written with
 * `replace` (typing adds no history entries) and is followed only when
 * something else changes it, such as a link or the back button. Reading the
 * page's own writes back would route each keystroke through the router's
 * deferred update, and the field would drop characters.
 */
export function SearchFiltersProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const onFilterRoute = FILTER_ROUTES.has(pathname);
  const fromUrl = readFilters(params);

  const [filters, setFilters] = useState<Filters>(fromUrl);
  const current = useRef(fromUrl);
  const tracker = useRef<ReturnType<typeof createOwnWriteTracker> | null>(null);
  if (tracker.current === null) tracker.current = createOwnWriteTracker(fromUrl);
  const pendingWrite = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The timer fires later; it must use the router's current setter, not the
  // one from the render that scheduled it.
  const setParamsRef = useRef(setParams);
  useEffect(() => {
    setParamsRef.current = setParams;
  }, [setParams]);

  const cancelPendingWrite = useCallback(() => {
    if (pendingWrite.current === null) return;
    clearTimeout(pendingWrite.current);
    pendingWrite.current = null;
  }, []);

  const writeToUrl = useCallback((next: Filters) => {
    if (!FILTER_ROUTES.has(window.location.pathname)) return;

    tracker.current?.wrote(next);
    setParamsRef.current(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (next.stateCode === NationalStateCode.All) updated.delete("uf");
        else updated.set("uf", next.stateCode);
        if (next.query === "") updated.delete("q");
        else updated.set("q", next.query);
        return updated;
      },
      { replace: true },
    );
  }, []);

  const update = useCallback(
    (changes: Partial<Filters>, writeNow: boolean) => {
      const next = { ...current.current, ...changes };
      current.current = next;
      setFilters(next);

      cancelPendingWrite();
      if (writeNow) {
        writeToUrl(next);
      } else {
        pendingWrite.current = setTimeout(() => {
          pendingWrite.current = null;
          writeToUrl(current.current);
        }, QUERY_WRITE_DELAY_MS);
      }
    },
    [cancelPendingWrite, writeToUrl],
  );

  const setStateCode = useCallback(
    (value: string) => update({ stateCode: value }, true),
    [update],
  );
  const setQuery = useCallback(
    (value: string) => update({ query: value }, false),
    [update],
  );
  const flush = useCallback(() => {
    if (pendingWrite.current === null) return;
    cancelPendingWrite();
    writeToUrl(current.current);
  }, [cancelPendingWrite, writeToUrl]);

  // Runs when the URL values change on a filter page. A value this provider
  // wrote is its own write arriving; anything else came from outside.
  const { stateCode: urlStateCode, query: urlQuery } = fromUrl;
  useEffect(() => {
    if (!onFilterRoute) return;

    const incoming = { stateCode: urlStateCode, query: urlQuery };
    if (tracker.current?.arrived(incoming)) return;
    if (sameFilters(incoming, current.current)) return;

    cancelPendingWrite();
    tracker.current?.reset();
    current.current = incoming;
    // Following the URL is the point of this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setFilters(incoming);
  }, [urlStateCode, urlQuery, onFilterRoute, cancelPendingWrite]);

  useEffect(() => cancelPendingWrite, [cancelPendingWrite]);

  const value = useMemo<SearchFiltersValue>(
    () => ({
      stateCode: filters.stateCode,
      query: filters.query,
      search: buildSearch(filters),
      setStateCode,
      setQuery,
      flush,
    }),
    [filters, setStateCode, setQuery, flush],
  );

  return (
    <SearchFiltersContext.Provider value={value}>
      {children}
    </SearchFiltersContext.Provider>
  );
}
