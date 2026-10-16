import { createContext, useContext } from "react";
import type { OccupancyResponse, UnitOccupancy } from "./occupancy";

export type OccupancyLayerState =
  /** The first check has not answered yet. */
  | { status: "checking" }
  /** The server has the demonstration turned off: the layer does not exist. */
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "success"; response: OccupancyResponse }
  | { status: "error"; message: string; response: OccupancyResponse | null };

export interface OccupancyLayerValue {
  /** Whether the server offers the layer at all. */
  isAvailable: boolean;
  /** The person's choice; off by default. */
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** Narrows the map and the list to the units of the simulation. */
  onlySimulated: boolean;
  setOnlySimulated: (only: boolean) => void;
  state: OccupancyLayerState;
  /** Last data received, kept while a refresh fails; `null` before any. */
  response: OccupancyResponse | null;
  /** Current occupancy by CNES, empty while the layer is off. */
  byUnit: ReadonlyMap<string, UnitOccupancy>;
  /** Advances only for units whose current state or history was updated. */
  historyVersions: ReadonlyMap<string, number>;
  /**
   * CNES of the simulation while "only simulated" is on, else `null`. It keeps
   * its identity across refreshes, so filtering on it does not rebuild the
   * results (and refit the map) every minute.
   */
  simulatedFilter: ReadonlySet<string> | null;
  retry: () => void;
}

export const OccupancyLayerContext = createContext<OccupancyLayerValue | null>(
  null,
);

/**
 * The "Ocupação simulada de leitos" layer is shared by the map, the list and the unit
 * detail, so it is held above the routes (see OccupancyLayerProvider).
 */
export function useOccupancyLayer(): OccupancyLayerValue {
  const value = useContext(OccupancyLayerContext);
  if (value === null) {
    throw new Error(
      "useOccupancyLayer needs an OccupancyLayerProvider above it.",
    );
  }
  return value;
}
