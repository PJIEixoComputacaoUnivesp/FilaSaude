import { OccupancySwatch } from "./OccupancySwatch";
import {
  describeOccupancy,
  formatTime,
  occupancyStatus,
  type UnitOccupancy,
} from "./occupancy";

/**
 * Occupancy of one unit next to its registry data: the level in words, the
 * observation time and the simulation mark, never the color alone.
 */
export function OccupancyBadge({
  occupancy,
  className = "",
}: {
  occupancy: UnitOccupancy;
  className?: string;
}) {
  const status = occupancyStatus(occupancy);
  return (
    <div
      className={`rounded-lg border border-violet-200 bg-occupancy-surface px-3 py-2 text-sm text-slate-800 ${className}`}
    >
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        <OccupancySwatch status={status} />
        {describeOccupancy(occupancy)}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-700">
        <span className="font-semibold text-occupancy-ink">Dado simulado</span>{" "}
        · {status === "stale" ? "último envio" : "observado"} às{" "}
        <time dateTime={occupancy.observedAt}>
          {formatTime(occupancy.observedAt)}
        </time>
      </p>
    </div>
  );
}
