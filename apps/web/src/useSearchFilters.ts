import { useCallback, useState } from "react";
import {
  useLocation,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import { isStateCode, NationalStateCode } from "./brazilianStates";

function readFilters(params: URLSearchParams) {
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
 * The page's own edits are written to the URL with `replace` and never read
 * back: reading them on every change routes each keystroke through the
 * router's deferred update, and the field drops characters while the user
 * types. The URL is read when the page mounts and again when a link or
 * back/forward changes it under the mounted page (push or pop), for example a
 * click on the logo while the map is open.
 */
export function useSearchFilters() {
  const [params, setParams] = useSearchParams();
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const [filters, setFilters] = useState(() => readFilters(params));
  const [seenKey, setSeenKey] = useState(key);

  if (key !== seenKey) {
    setSeenKey(key);
    if (navigationType !== "REPLACE") setFilters(readFilters(params));
  }

  const writeParam = useCallback(
    (name: "uf" | "q", value: string) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const isDefault =
            value === "" || (name === "uf" && value === NationalStateCode.All);
          if (isDefault) next.delete(name);
          else next.set(name, value);
          return next;
        },
        // Typing must not fill the history with one entry per letter.
        { replace: true },
      );
    },
    [setParams],
  );

  const setStateCode = useCallback(
    (value: string) => {
      setFilters((current) => ({ ...current, stateCode: value }));
      writeParam("uf", value);
    },
    [writeParam],
  );
  const setQuery = useCallback(
    (value: string) => {
      setFilters((current) => ({ ...current, query: value }));
      writeParam("q", value);
    },
    [writeParam],
  );

  return {
    stateCode: filters.stateCode,
    query: filters.query,
    setStateCode,
    setQuery,
  };
}
