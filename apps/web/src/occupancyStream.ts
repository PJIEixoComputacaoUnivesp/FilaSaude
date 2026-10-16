import {
  fetchOccupancy,
  parseOccupancyResponse,
  type OccupancyResponse,
} from "./occupancy";

interface SubscriptionCallbacks {
  onResponse: (response: OccupancyResponse | null) => void;
  onDelta: (response: OccupancyResponse) => void;
  onError: (error: Error) => void;
}

interface SubscriptionOptions {
  createSource?: () => EventSource;
  load?: typeof fetchOccupancy;
}

const RECONNECT_MESSAGE =
  "A atualização em tempo real foi interrompida. Reconectando…";

/** REST initializes or rebuilds the snapshot; SSE carries changed units. */
export function subscribeOccupancy(
  callbacks: SubscriptionCallbacks,
  options: SubscriptionOptions = {},
): () => void {
  const source =
    options.createSource?.() ?? new EventSource("/api/occupancy/stream");
  const load = options.load ?? fetchOccupancy;
  const controller = new AbortController();
  let running = false;
  let requested = false;
  let healthy = true;
  let snapshotReady = false;
  let buffered: OccupancyResponse | null = null;

  const reportDisconnected = () => {
    if (!controller.signal.aborted) {
      healthy = false;
      callbacks.onError(new Error(RECONNECT_MESSAGE));
    }
  };

  const refresh = async () => {
    requested = true;
    if (running) return;
    running = true;
    try {
      while (requested && !controller.signal.aborted) {
        requested = false;
        try {
          const response = await load(controller.signal);
          if (controller.signal.aborted) return;
          snapshotReady = response !== null;
          callbacks.onResponse(response);
          if (snapshotReady && buffered) {
            callbacks.onDelta(buffered);
            buffered = null;
          }
          if (!healthy) reportDisconnected();
        } catch (error: unknown) {
          if (controller.signal.aborted) return;
          callbacks.onError(
            error instanceof Error
              ? error
              : new Error("Não foi possível atualizar a ocupação."),
          );
        }
      }
    } finally {
      running = false;
    }
  };

  const resync = () => {
    healthy = true;
    snapshotReady = false;
    void refresh();
  };
  const updated = (event: Event) => {
    if (controller.signal.aborted) return;
    try {
      const delta = parseOccupancyResponse(
        JSON.parse((event as MessageEvent<string>).data),
      );
      healthy = true;
      if (!snapshotReady || running) {
        buffered = buffered ? mergeOccupancy(buffered, delta) : delta;
        if (!running) void refresh();
      } else callbacks.onDelta(delta);
    } catch {
      callbacks.onError(
        new Error("Não foi possível aplicar a atualização de ocupação."),
      );
      resync();
    }
  };
  source.addEventListener("open", resync);
  source.addEventListener("resync", resync);
  source.addEventListener("occupancy.updated", updated);
  source.addEventListener("error", reportDisconnected);
  source.addEventListener("unavailable", reportDisconnected);

  return () => {
    controller.abort();
    source.removeEventListener("open", resync);
    source.removeEventListener("resync", resync);
    source.removeEventListener("occupancy.updated", updated);
    source.removeEventListener("error", reportDisconnected);
    source.removeEventListener("unavailable", reportDisconnected);
    source.close();
  };
}

/** Replace changed units and preserve every other unit in the national view. */
export function mergeOccupancy(
  current: OccupancyResponse,
  delta: OccupancyResponse,
): OccupancyResponse {
  const units = new Map(current.data.map((unit) => [unit.unitCnes, unit]));
  for (const unit of delta.data) {
    const previous = units.get(unit.unitCnes);
    const order = previous ? compareVersion(unit, previous) : 1;
    if (
      order > 0 ||
      (order === 0 &&
        Date.parse(delta.metadata.generatedAt) >=
          Date.parse(current.metadata.generatedAt))
    ) {
      units.set(unit.unitCnes, unit);
    }
  }
  return {
    data: [...units.values()].sort((a, b) =>
      a.unitCnes.localeCompare(b.unitCnes),
    ),
    metadata:
      Date.parse(delta.metadata.generatedAt) >=
      Date.parse(current.metadata.generatedAt)
        ? delta.metadata
        : current.metadata,
  };
}

function compareVersion(
  a: OccupancyResponse["data"][number],
  b: OccupancyResponse["data"][number],
): number {
  for (const key of ["occurredAt", "observedAt", "receivedAt"] as const) {
    const difference = Date.parse(a[key]) - Date.parse(b[key]);
    if (difference !== 0) return difference;
  }
  return a.eventId && b.eventId ? a.eventId.localeCompare(b.eventId) : 0;
}

/** Expiration is local, including during a disconnect; it makes no request. */
export function expireOccupancy(
  response: OccupancyResponse,
  now: number,
): OccupancyResponse {
  let changed = false;
  const data = response.data.map((unit) => {
    if (
      unit.confirmation === "recent" &&
      now - Date.parse(unit.observedAt) >
        response.metadata.staleAfterMinutes * 60_000
    ) {
      changed = true;
      return { ...unit, confirmation: "stale" as const, level: null };
    }
    return unit;
  });
  return changed ? { ...response, data } : response;
}
