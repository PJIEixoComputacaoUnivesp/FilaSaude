import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  UserLocationContext,
  type LocationState,
  type UserPosition,
} from "./useUserLocation";

const timeoutMessage =
  "A localização demorou para responder. Tente novamente em um local com melhor sinal.";
const outOfAreaMessage =
  "Sua posição está fora da área exibida no mapa ou não é válida. Busque por cidade ou unidade.";

// The quick reading frames the map at once from the network position or a
// recent one; the precise reading waits for a fresh fix (GPS on a phone) and
// replaces it only when it is more accurate.
const quickOptions: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 5 * 60_000,
};
const preciseOptions: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 30_000,
  maximumAge: 0,
};

function isInsideMap({ latitude, longitude, accuracy }: UserPosition) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    latitude >= -34 &&
    latitude <= 6 &&
    longitude >= -74 &&
    longitude <= -34
  );
}

/**
 * Asks for the position as soon as the person enters the app, so the browser's
 * prompt is answered once instead of looking for a button. The map and the
 * list share the answer. A refusal is final: nothing asks again.
 */
export function UserLocationProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [state, setState] = useState<LocationState>({ status: "idle" });
  // getCurrentPosition cannot be cancelled. Ignore callbacks after removal,
  // navigation or a newer request.
  const requestId = useRef(0);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function cancel() {
    requestId.current += 1;
    pending.current = false;
    clearTimeout(timer.current);
  }

  // Once per visit, on the first public page: the team's admin page has no
  // use for it. Deferred so React's development double mount asks only once.
  const started = useRef(false);
  const isAdmin = pathname.startsWith("/admin");
  useEffect(() => {
    if (started.current || isAdmin) return;
    const start = setTimeout(() => {
      started.current = true;
      locate();
    });
    return () => clearTimeout(start);
  }, [isAdmin]);

  useEffect(() => cancel, []);

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
    let best: UserPosition | undefined;
    let preciseDone = false;
    let outstanding = 2;
    let lastError: LocationState = {
      status: "error",
      message:
        "Não foi possível obter sua localização. Verifique a localização do dispositivo e tente novamente.",
      canRetry: true,
    };
    const isCurrent = () => requestId.current === currentRequest;
    const finish = (next: LocationState) => {
      if (!isCurrent()) return;
      cancel();
      setState(next);
    };
    // A reading is over, with or without a position.
    const settle = (precise: boolean) => {
      outstanding -= 1;
      if (precise) preciseDone = true;
      if (best) {
        setState({ status: "success", position: best, refining: !preciseDone });
        if (outstanding === 0) pending.current = false;
      } else if (outstanding === 0) {
        finish(lastError);
      }
    };
    const read = (options: PositionOptions, precise: boolean) =>
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (!isCurrent()) return;
          const { latitude, longitude, accuracy } = coords;
          const position = { latitude, longitude, accuracy };
          if (!isInsideMap(position)) {
            lastError = {
              status: "error",
              message: outOfAreaMessage,
              canRetry: false,
            };
          } else if (!best || accuracy < best.accuracy) {
            best = position;
            clearTimeout(timer.current);
          }
          settle(precise);
        },
        ({ code }) => {
          if (!isCurrent()) return;
          // PERMISSION_DENIED: the person said no, so the map just goes on.
          if (code === 1) {
            finish({ status: "idle" });
            return;
          }
          if (code === 3) {
            lastError = {
              status: "error",
              message: timeoutMessage,
              canRetry: true,
            };
          }
          settle(precise);
        },
        options,
      );

    setState({ status: "loading" });
    // Also bounds time waiting for a permission prompt left unanswered.
    timer.current = setTimeout(
      () =>
        finish({ status: "error", message: timeoutMessage, canRetry: true }),
      20_000,
    );

    try {
      read(quickOptions, false);
      read(preciseOptions, true);
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

  const value = useMemo(() => ({ state, locate, clear }), [state]);
  return (
    <UserLocationContext.Provider value={value}>
      {children}
    </UserLocationContext.Provider>
  );
}
