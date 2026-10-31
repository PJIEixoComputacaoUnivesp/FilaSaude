import { OccupancySwatch } from "./OccupancySwatch";
import {
  describeOccupancy,
  describeWaitEstimate,
  formatDateTime,
  formatTime,
  occupancyStatus,
  SIMULATION_SOURCE,
  type UnitOccupancy,
} from "./occupancy";

/**
 * Situation of one unit next to its registry data: the level in words, the
 * current waiting and in-service counts, its source and when it was sent,
 * never the color alone. The tint and the source line are the simulation
 * mark; the values inside do not repeat it. Divs, not paragraphs: Leaflet
 * adds a large margin to paragraphs in popups.
 */
export function OccupancyBadge({
  occupancy,
  className = "",
}: {
  occupancy: UnitOccupancy;
  className?: string;
}) {
  const status = occupancyStatus(occupancy);
  const attendance = occupancy.attendance;
  // A stale snapshot keeps only its date here, as its level: the detail
  // shows the last values with that warning.
  const counts =
    status === "stale"
      ? []
      : [
          `Esperando ${attendance?.waiting ?? "não informado"}`,
          `Em atendimento ${attendance?.inService ?? "não informado"}`,
        ];
  return (
    <div
      className={`rounded-xl border border-occupancy-border bg-occupancy-surface px-3 py-2 text-sm text-slate-800 ${className}`}
    >
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <OccupancySwatch status={status} />
        {describeOccupancy(occupancy)}
      </div>
      {counts.length > 0 && (
        <div className="mt-1 text-xs tabular-nums text-slate-800">
          {counts.join(" · ")}
        </div>
      )}
      {status !== "stale" && occupancy.waitEstimate?.status === "available" && (
        <div className="mt-1 text-xs tabular-nums text-slate-800">
          Espera estimada: {describeWaitEstimate(occupancy)}
          {occupancy.waitComparison?.status === "above-usual" &&
            " · acima do habitual"}
        </div>
      )}
      <div className="mt-1 text-xs leading-relaxed text-slate-600">
        {SIMULATION_SOURCE} ·{" "}
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
