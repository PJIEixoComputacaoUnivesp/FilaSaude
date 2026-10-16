import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchOccupancy, type UnitOccupancy } from "./occupancy";
import {
  OccupancyLayerContext,
  type OccupancyLayerState,
  type OccupancyLayerValue,
} from "./useOccupancyLayer";

// The simulator confirms every two minutes; a minute keeps the layer close to
// it without loading the API for nothing.
const REFRESH_MS = 60_000;
const STORAGE_KEY = "filasaude:ocupacao-simulada";

function readStoredChoice(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function storeChoice(enabled: boolean): void {
  try {
    if (enabled) window.sessionStorage.setItem(STORAGE_KEY, "on");
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be blocked; the choice then lasts until the page reloads.
  }
}

function responseOf(state: OccupancyLayerState) {
  return state.status === "success" || state.status === "error"
    ? state.response
    : null;
}

const noOccupancy: ReadonlyMap<string, UnitOccupancy> = new Map();

/**
 * Asks the API once whether the demonstration is on (GET /occupancy answers
 * 404 when it is off). While the layer is on, it refreshes on a timer, only
 * when the page is visible, and replaces the data in place: focus never moves
 * and nothing is announced on a refresh.
 */
export function OccupancyLayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OccupancyLayerState>({
    status: "checking",
  });
  const [isEnabled, setEnabledState] = useState(readStoredChoice);
  const [onlySimulated, setOnlySimulated] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const isAvailable =
    state.status !== "checking" && state.status !== "unavailable";
  const shouldFetch = state.status === "checking" || (isAvailable && isEnabled);

  useEffect(() => {
    if (!shouldFetch) return;
    const controller = new AbortController();
    let timer: number | undefined;

    const load = () => {
      fetchOccupancy(controller.signal)
        .then((response) => {
          setState(
            response === null
              ? { status: "unavailable" }
              : { status: "success", response },
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState((previous) =>
            // A first check that fails offers no layer, as when it is off: a
            // switch that only leads to an error helps nobody.
            previous.status === "checking"
              ? { status: "unavailable" }
              : {
                  status: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Não foi possível consultar a ocupação simulada.",
                  // A failed refresh keeps the last data, marked by its time.
                  response: responseOf(previous),
                },
          );
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    load();
    if (isEnabled) {
      timer = window.setInterval(refreshWhenVisible, REFRESH_MS);
      document.addEventListener("visibilitychange", refreshWhenVisible);
    }
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [shouldFetch, isEnabled, attempt]);

  const setEnabled = useCallback((enabled: boolean) => {
    storeChoice(enabled);
    setEnabledState(enabled);
    if (!enabled) setOnlySimulated(false);
  }, []);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const response = responseOf(state);
  const byUnit = useMemo(
    () =>
      isEnabled && response
        ? new Map(response.data.map((item) => [item.unitCnes, item]))
        : noOccupancy,
    [isEnabled, response],
  );

  const isFiltering = isAvailable && isEnabled && onlySimulated;
  const simulatedKey = isFiltering ? [...byUnit.keys()].sort().join(",") : null;
  const simulatedFilter = useMemo(
    () =>
      simulatedKey === null
        ? null
        : new Set(simulatedKey === "" ? [] : simulatedKey.split(",")),
    [simulatedKey],
  );

  const value = useMemo<OccupancyLayerValue>(
    () => ({
      isAvailable,
      isEnabled: isAvailable && isEnabled,
      setEnabled,
      onlySimulated: isFiltering,
      setOnlySimulated,
      state,
      response,
      byUnit,
      simulatedFilter,
      retry,
    }),
    [
      isAvailable,
      isEnabled,
      setEnabled,
      isFiltering,
      state,
      response,
      byUnit,
      simulatedFilter,
      retry,
    ],
  );

  return (
    <OccupancyLayerContext.Provider value={value}>
      {children}
    </OccupancyLayerContext.Provider>
  );
}
