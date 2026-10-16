import {
  NEUTRAL_MARKER,
  STATUS_COLORS,
  type OccupancyStatus,
} from "./occupancy";

/**
 * The marker of a status, drawn as on the map; `neutral` is a unit outside
 * the simulation. Decorative: the text next to it says the same.
 */
export function OccupancySwatch({
  status,
}: {
  status: OccupancyStatus | "neutral";
}) {
  const { fill, stroke, hollow } =
    status === "neutral"
      ? { ...NEUTRAL_MARKER, hollow: false }
      : STATUS_COLORS[status];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      focusable="false"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill={fill}
        // The neutral marker's white ring would vanish on white.
        stroke={status === "neutral" ? "#0b3f80" : stroke}
        strokeWidth={hollow ? 2.5 : 2}
        strokeDasharray={status === "stale" ? "3 2" : undefined}
      />
    </svg>
  );
}
