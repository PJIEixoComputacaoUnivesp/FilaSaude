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
  | { status: "error"; message: string };

const timeoutMessage =
  "A localização demorou para responder. Tente novamente em um local com melhor sinal.";

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

  useEffect(() => cancel, []);

  function locate() {
    if (pending.current) return;
    cancel();
    if (!window.isSecureContext) {
      setState({
        status: "error",
        message: "Para usar a localização, acesse o site por HTTPS.",
      });
      return;
    }
    if (!navigator.geolocation) {
      setState({
        status: "error",
        message:
          "Este navegador não oferece localização. Você pode buscar por cidade ou unidade.",
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
      () => finish({ status: "error", message: timeoutMessage }),
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
            });
            return;
          }
          finish({
            status: "success",
            position: { latitude, longitude, accuracy },
          });
        },
        ({ code }) =>
          finish({
            status: "error",
            message:
              code === 1
                ? "Permissão de localização negada. Para tentar novamente, permita o acesso nas configurações do navegador."
                : code === 3
                  ? timeoutMessage
                  : "Não foi possível obter sua localização. Verifique a localização do dispositivo e tente novamente.",
          }),
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    } catch {
      finish({
        status: "error",
        message:
          "Não foi possível acessar a localização. Verifique as permissões do navegador e tente novamente.",
      });
    }
  }

  function clear() {
    cancel();
    setState({ status: "idle" });
  }

  return { state, locate, clear };
}
