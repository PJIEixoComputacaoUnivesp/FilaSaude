import { createContext, useContext } from "react";

export interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  /** `refining` while the precise reading may still improve the position. */
  | { status: "success"; position: UserPosition; refining: boolean }
  /** `canRetry` is false when asking again would fail the same way. */
  | { status: "error"; message: string; canRetry: boolean };

export interface UserLocationValue {
  state: LocationState;
  /** Asks again, after a failure that a new attempt may solve. */
  locate: () => void;
  /** Forgets the position for the rest of the visit. */
  clear: () => void;
}

export const UserLocationContext = createContext<UserLocationValue | null>(
  null,
);

/**
 * The person's position is shared by the map and the list, so it is held
 * above the routes (see UserLocationProvider). It lives only in memory.
 */
export function useUserLocation(): UserLocationValue {
  const value = useContext(UserLocationContext);
  if (value === null) {
    throw new Error(
      "useUserLocation needs a UserLocationProvider above it.",
    );
  }
  return value;
}
