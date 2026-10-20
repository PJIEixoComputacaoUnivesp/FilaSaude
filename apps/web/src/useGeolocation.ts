import { useEffect, useRef, useState } from "react";

export interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; position: UserPosition }
  /** `canRetry` is false when asking again would fail the same way. */
  | { status: "error"; message: string; canRetry: boolean };

const timeoutMessage =
  "A localização demorou para responder. Tente novamente em um local com melhor sinal.";

/**
 * Asks for the position as soon as the map opens, so the person answers the
 * browser's prompt once instead of looking for a button. A refusal is final:
 * the map stays national and nothing asks again.
 */
export function useGeolocation() {
  const [state, setState] = useState<LocationState>({ status: "idle" });
  // getCurrentPosition cannot be cancelled. Ignore callbacks after removal,
  // navigation or a newer request, and keep duplicate clicks from prompting.
  const requestId = useRef(0);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function cancel() {
    requestId.current += 1;
    pending.current = false;
    clearTimeout(timer.current);
  }

  // Only on mount: a new map page is a new visit to the map. Deferred so
  // React's development double mount asks only once.
  useEffect(() => {
    const start = setTimeout(locate);
    return () => {
      clearTimeout(start);
      cancel();
    };
  }, []);

  function locate() {
    if (pending.current) return;
    cancel();
    if (!window.isSecureContext) {
      setState({
        status: "error",
        message: "Para usar a localização, acesse o site por HTTPS.",
        canRetry: false,
      });
      return;
    }
    if (!navigator.geolocation) {
      setState({
        status: "error",
        message:
          "Este navegador não oferece localização. Você pode buscar por cidade ou unidade.",
        canRetry: false,
      });
      return;
    }

    pending.current = true;
    const currentRequest = requestId.current;
    setState({ status: "loading" });
    const finish = (next: LocationState) => {
      if (requestId.current !== currentRequest) return;
      cancel();
      setState(next);
    };
    // Also bounds time waiting for a permission prompt left unanswered.
    timer.current = setTimeout(
      () =>
        finish({ status: "error", message: timeoutMessage, canRetry: true }),
      20_000,
    );

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const { latitude, longitude, accuracy } = coords;
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            !Number.isFinite(accuracy) ||
            accuracy < 0 ||
            latitude < -34 ||
            latitude > 6 ||
            longitude < -74 ||
            longitude > -34
          ) {
            finish({
              status: "error",
              message:
                "Sua posição está fora da área exibida no mapa ou não é válida. Busque por cidade ou unidade.",
              canRetry: false,
            });
            return;
          }
          finish({
            status: "success",
            position: { latitude, longitude, accuracy },
          });
        },
        ({ code }) =>
          finish(
            // PERMISSION_DENIED: the person said no, so the map just goes on.
            code === 1
              ? { status: "idle" }
              : {
                  status: "error",
                  message:
                    code === 3
                      ? timeoutMessage
                      : "Não foi possível obter sua localização. Verifique a localização do dispositivo e tente novamente.",
                  canRetry: true,
                },
          ),
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    } catch {
      finish({
        status: "error",
        message:
          "Não foi possível acessar a localização. Verifique as permissões do navegador.",
        canRetry: false,
      });
    }
  }

  function clear() {
    cancel();
    setState({ status: "idle" });
  }

  return { state, locate, clear };
}
