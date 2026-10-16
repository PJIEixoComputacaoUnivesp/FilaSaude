import type { SimulatorUnit } from './units.ts';

/**
 * Roles of the `showcase` scenario, which keeps every state of the
 * demonstration script visible on a running site at once. They are given in
 * CNES order, so the same sample always plays the same roles; units beyond
 * the list follow the normal random walk.
 */
export type ShowcaseRole =
  | { kind: 'fixed'; ratio: number }
  | { kind: 'intermittent' }
  | { kind: 'duplicate' }
  | { kind: 'late' };

const ROLES: readonly ShowcaseRole[] = [
  { kind: 'fixed', ratio: 0.9 },
  { kind: 'fixed', ratio: 0.7 },
  { kind: 'fixed', ratio: 0.3 },
  { kind: 'intermittent' },
  { kind: 'duplicate' },
  { kind: 'late' },
];

/**
 * An intermittent unit alternates windows of confirmations and silence. The
 * silence is longer than the API's 20 minutes, so the unit shows "sem
 * confirmação recente", and then comes back with a full snapshot.
 */
export const INTERMITTENT_WINDOW_MS = 30 * 60_000;
/** How far back the extra snapshot of a `late` unit claims to be. */
export const LATE_EVENT_DELAY_MS = 10 * 60_000;

export function showcaseRoles(
  units: readonly SimulatorUnit[],
): Map<string, ShowcaseRole> {
  const ordered = [...units].sort((left, right) => left.id.localeCompare(right.id));
  return new Map(
    ordered.slice(0, ROLES.length).map((unit, index) => [unit.id, ROLES[index]]),
  );
}

/** Windows are aligned to the clock, so a restart keeps the same rhythm. */
export function isSilent(now: Date): boolean {
  return Math.floor(now.getTime() / INTERMITTENT_WINDOW_MS) % 2 === 1;
}
