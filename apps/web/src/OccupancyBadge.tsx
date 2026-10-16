import { OccupancySwatch } from "./OccupancySwatch";
import {
  describeOccupancy,
  formatDateTime,
  formatTime,
  occupancyStatus,
  type UnitOccupancy,
} from "./occupancy";

/**
 * Occupancy of one unit next to its registry data: the level in words, its
 * source, when it was sent and the simulation mark, never the color alone.
 * Divs, not paragraphs: Leaflet adds a large margin to paragraphs in popups.
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
      className={`rounded-lg border border-occupancy-border bg-occupancy-surface px-3 py-2 text-sm text-slate-800 ${className}`}
    >
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <OccupancySwatch status={status} />
        {describeOccupancy(occupancy)}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-slate-700">
        <span className="font-semibold text-occupancy-ink">Dado simulado de leitos</span>{" "}
        · Simulador do FilaSaúde ·{" "}
        {status === "stale" ? "último envio em " : "enviado às "}
        <time dateTime={occupancy.observedAt}>
          {status === "stale"
            ? formatDateTime(occupancy.observedAt)
            : formatTime(occupancy.observedAt)}
        </time>
      </div>
    </div>
  );
}
