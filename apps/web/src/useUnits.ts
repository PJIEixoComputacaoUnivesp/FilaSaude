import { useCallback, useEffect, useState } from "react";
import { fetchUnits, type UnitsResponse } from "./units";

type UnitsState =
  | { status: "loading" }
  | { status: "success"; response: UnitsResponse }
  | { status: "error"; message: string };

export function useUnits() {
  const [state, setState] = useState<UnitsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchUnits(controller.signal)
      .then((response) => setState({ status: "success", response }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Não foi possível consultar as unidades agora.",
          });
        }
      });

    return () => controller.abort();
  }, [attempt]);

  return { state, retry };
}
