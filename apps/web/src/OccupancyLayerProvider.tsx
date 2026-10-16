import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchOccupancy,
  type OccupancyResponse,
  type UnitOccupancy,
} from "./occupancy";
import {
  expireOccupancy,
  mergeOccupancy,
  subscribeOccupancy,
} from "./occupancyStream";
import {
  OccupancyLayerContext,
  type OccupancyLayerState,
  type OccupancyLayerValue,
} from "./useOccupancyLayer";

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

/** One national SSE subscription shared by map, list and unit detail. */
export function OccupancyLayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OccupancyLayerState>({
    status: "checking",
  });
  const [isEnabled, setEnabledState] = useState(readStoredChoice);
  const [onlySimulated, setOnlySimulated] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<
    ReadonlyMap<string, number>
  >(new Map());
  const [attempt, setAttempt] = useState(0);

  const isAvailable =
    state.status !== "checking" && state.status !== "unavailable";
  const checking = state.status === "checking";
  const serverOffset = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const noteUpdates = (response: OccupancyResponse) => {
      serverOffset.current =
        Date.parse(response.metadata.generatedAt) - Date.now();
      setHistoryVersions((previous) => {
        const next = new Map(previous);
        for (const unit of response.data)
          next.set(unit.unitCnes, (next.get(unit.unitCnes) ?? 0) + 1);
        return next;
      });
    };
    const receiveDelta = (delta: OccupancyResponse) => {
      if (controller.signal.aborted) return;
      noteUpdates(delta);
      setState((previous) => {
        const response = responseOf(previous);
        return response
          ? { status: "success", response: mergeOccupancy(response, delta) }
          : previous;
      });
    };
    const receive = (response: OccupancyResponse | null) => {
      if (controller.signal.aborted) return;
      if (response) noteUpdates(response);
      setState(
        response === null
          ? { status: "unavailable" }
          : { status: "success", response },
      );
    };
    const fail = (error: Error) => {
      if (controller.signal.aborted) return;
      setState((previous) =>
        previous.status === "checking"
          ? { status: "unavailable" }
          : {
              status: "error",
              message: error.message,
              response: responseOf(previous),
            },
      );
    };
    if (checking) {
      void fetchOccupancy(controller.signal)
        .then(receive)
        .catch((error: unknown) => {
          fail(
            error instanceof Error
              ? error
              : new Error("Não foi possível consultar a ocupação simulada de leitos."),
          );
        });
      return () => controller.abort();
    }
    if (!isAvailable || !isEnabled) return;
    let unsubscribe: (() => void) | undefined;
    const followVisibility = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (document.visibilityState === "visible") {
        unsubscribe = subscribeOccupancy({
          onResponse: receive,
          onDelta: receiveDelta,
          onError: fail,
        });
      }
    };
    followVisibility();
    document.addEventListener("visibilitychange", followVisibility);
    return () => {
      controller.abort();
      unsubscribe?.();
      document.removeEventListener("visibilitychange", followVisibility);
    };
  }, [checking, isAvailable, isEnabled, attempt]);

  useEffect(() => {
    if (!isAvailable || !isEnabled) return;
    // Only the local confirmation clock advances here; there is no polling.
    const timer = window.setInterval(() => {
      setState((previous) => {
        const response = responseOf(previous);
        if (!response) return previous;
        const expired = expireOccupancy(
          response,
          Date.now() + serverOffset.current,
        );
        return expired === response
          ? previous
          : { ...previous, response: expired };
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isAvailable, isEnabled]);

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
      historyVersions,
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
      historyVersions,
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
