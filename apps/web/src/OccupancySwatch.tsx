import { STATUS_COLORS, type OccupancyStatus } from "./occupancy";

/** The marker of a status, drawn as on the map. Decorative: text says it. */
export function OccupancySwatch({ status }: { status: OccupancyStatus }) {
  const { fill, stroke, hollow } = STATUS_COLORS[status];
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
        // A white ring disappears on white; the legend outlines it in gray.
        stroke={stroke === "#ffffff" ? "#64748b" : stroke}
        strokeWidth={hollow ? 2.5 : 1.5}
        strokeDasharray={status === "stale" ? "3 2" : undefined}
      />
    </svg>
  );
}
