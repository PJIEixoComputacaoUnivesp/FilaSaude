import { useCallback, useEffect, useState } from "react";
import { fetchUnits, type UnitsResponse } from "./units";

type UnitsState =
  | { status: "loading"; stateCode: string }
  | { status: "success"; stateCode: string; response: UnitsResponse }
  | { status: "error"; stateCode: string; message: string };

const unitsCache = new Map<string, UnitsResponse>();

export function useUnits(stateCode: string) {
  const cached = unitsCache.get(stateCode);
  const [state, setState] = useState<UnitsState>(
    cached
      ? { status: "success", stateCode, response: cached }
      : { status: "loading", stateCode },
  );
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    unitsCache.delete(stateCode);
    setState({ status: "loading", stateCode });
    setAttempt((current) => current + 1);
  }, [stateCode]);

  useEffect(() => {
    const cached = unitsCache.get(stateCode);
    if (cached && attempt === 0) {
      return;
    }

    const controller = new AbortController();

    fetchUnits(stateCode, controller.signal)
      .then((response) => {
        unitsCache.set(stateCode, response);
        setState({ status: "success", stateCode, response });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            stateCode,
            message:
              error instanceof Error
                ? error.message
                : "Não foi possível consultar as unidades agora.",
          });
        }
      });

    return () => controller.abort();
  }, [attempt, stateCode]);

  const visibleState: UnitsState =
    state.stateCode === stateCode ? state : { status: "loading", stateCode };

  return { state: visibleState, retry };
}
