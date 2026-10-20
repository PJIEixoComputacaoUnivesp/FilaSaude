import { createContext, useContext } from "react";

export interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type LocationState =
  /** Not asked yet. */
  | { status: "idle" }
  /** The browser refused; asked again only if the permission changes. */
  | { status: "denied" }
  /** The person removed or dismissed it; not asked again in this visit. */
  | { status: "removed" }
  /** Keep the last position visible while a new reading is pending. */
  | { status: "loading"; previous?: UserPosition }
  /** `refining` while the precise reading may still improve the position. */
  | { status: "success"; position: UserPosition; refining: boolean }
  /** `canRetry` is false when asking again would fail the same way. */
  | { status: "error"; message: string; canRetry: boolean };

export interface UserLocationValue {
  state: LocationState;
  /** Asks again, after a failure that a new attempt may solve. */
  locate: () => void;
  /** Forgets the position (or a failure) for the rest of the visit. */
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
