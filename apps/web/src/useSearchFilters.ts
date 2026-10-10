import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isStateCode, NationalStateCode } from "./brazilianStates";

// Browsers limit history.replaceState (Safari throws after 100 calls in 30
// seconds), so the typed text reaches the URL once typing pauses.
const QUERY_WRITE_DELAY_MS = 300;

interface Filters {
  stateCode: string;
  query: string;
}

function readFilters(params: URLSearchParams): Filters {
  const requestedState = params.get("uf")?.toUpperCase() ?? "";

  return {
    stateCode: isStateCode(requestedState)
      ? requestedState
      : NationalStateCode.All,
    query: params.get("q") ?? "",
  };
}

/**
 * The map and the list are two views of one search, so the filters live in the
 * URL (`?uf=SP&q=osasco`). Switching views keeps them, and a missing or unknown
 * `uf` means the whole country.
 *
 * The page keeps its own copy of the filters so the fields answer at once. It
 * writes that copy to the URL (with `replace`, so typing adds no history
 * entries) and follows the URL when something else changes it, such as a link
 * or the back button. The URL is never read back into the fields for the
 * page's own writes: that routes each keystroke through the router's deferred
 * update and the field drops characters.
 */
export function useSearchFilters() {
  const [params, setParams] = useSearchParams();
  const fromUrl = readFilters(params);
  const [filters, setFilters] = useState(fromUrl);
  // Mirrors `filters` and `written` for the timer and the handlers, which
  // must not read stale closures.
  const current = useRef(fromUrl);
  const written = useRef(fromUrl);
  const pendingWrite = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingWrite = useCallback(() => {
    if (pendingWrite.current === null) return;
    clearTimeout(pendingWrite.current);
    pendingWrite.current = null;
  }, []);

  const writeToUrl = useCallback(
    (next: Filters) => {
      written.current = next;
      setParams(
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
    },
    [setParams],
  );

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
  /** Writes a pending query now, for example when the field loses focus. */
  const flush = useCallback(() => {
    if (pendingWrite.current === null) return;
    cancelPendingWrite();
    writeToUrl(current.current);
  }, [cancelPendingWrite, writeToUrl]);

  // Runs when the URL values change. A URL equal to what this page last wrote
  // is its own write arriving; any other value came from outside, so adopt it.
  const { stateCode: urlStateCode, query: urlQuery } = fromUrl;
  useEffect(() => {
    if (
      urlStateCode === written.current.stateCode &&
      urlQuery === written.current.query
    ) {
      return;
    }
    cancelPendingWrite();
    const adopted = { stateCode: urlStateCode, query: urlQuery };
    written.current = adopted;
    current.current = adopted;
    // Following the URL is the point of this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setFilters(adopted);
  }, [urlStateCode, urlQuery, cancelPendingWrite]);

  useEffect(() => cancelPendingWrite, [cancelPendingWrite]);

  return {
    stateCode: filters.stateCode,
    query: filters.query,
    setStateCode,
    setQuery,
    flush,
  };
}
