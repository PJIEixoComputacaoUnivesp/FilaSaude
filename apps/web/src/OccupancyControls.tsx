import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LiveStatus } from "./LiveStatus";
import { OccupancySwatch } from "./OccupancySwatch";
import {
  ABOUT_SIMULATION,
  formatTime,
  COLOR_NOTICE,
  OCCUPANCY_STATUSES,
  OCCUPANCY_EXPLANATION,
  SIMULATION_NOTICE,
  SIMULATION_NOTICE_SHORT,
  SIMULATION_SOURCE,
  STATUS_LABELS,
  STATUS_RANGES,
} from "./occupancy";
import { formatCount } from "./units";
import { useOccupancyLayer } from "./useOccupancyLayer";

/**
 * Switch, filter, legend and simulation notice of the "Ocupação simulada"
 * layer. Renders nothing when the server has the demonstration turned off.
 * The compact variant sits inside the map panel; the list uses a card.
 */
export function OccupancyControls({
  compact = false,
  collapsible = false,
  onOpenLegend,
  legendOpen = false,
}: {
  compact?: boolean;
  collapsible?: boolean;
  onOpenLegend?: () => void;
  legendOpen?: boolean;
}) {
  const layer = useOccupancyLayer();
  const hintId = useId();
  const secondaryId = useId();
  const [isExpanded, setExpanded] = useState(false);
  const legendRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (legendOpen) legendRef.current?.scrollIntoView({ block: "start" });
  }, [legendOpen]);
  // Announced only after the person turns the layer on, once the data is in:
  // not when the page loads with the layer already on, and not on refreshes.
  const [announceCount, setAnnounceCount] = useState(false);
  if (!layer.isAvailable) return null;

  const { state } = layer;
  const { response } = layer;
  const unitCount = response?.data.length ?? 0;
  const simulatedText = `${formatCount(
    unitCount,
    "unidade com ocupação simulada",
    "unidades com ocupação simulada",
  )} no Brasil`;
  const announcement =
    announceCount && layer.isEnabled && response ? `${simulatedText}.` : "";

  return (
    <div
      className={
        compact
          ? "mt-2 border-t border-slate-100 pt-2 map-wide:mt-3 map-wide:pt-3"
          : // Violet tint, no white card: it is a control of the layer, not
            // one more result among the unit cards below.
            "rounded-2xl border border-occupancy-border bg-occupancy-surface p-4 sm:p-5"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            role="switch"
            checked={layer.isEnabled}
            onChange={(event) => {
              layer.setEnabled(event.target.checked);
              setAnnounceCount(event.target.checked);
            }}
            aria-describedby={hintId}
            className="peer sr-only"
          />
          {/* The thumb has a border, so its position still shows the state in
            forced colors, where backgrounds are replaced. */}
          <span
            aria-hidden="true"
            className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-slate-500 bg-white transition peer-checked:border-occupancy-control peer-checked:bg-occupancy-control peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fila-blue motion-reduce:transition-none peer-checked:[&>span]:translate-x-5 peer-checked:[&>span]:border-white peer-checked:[&>span]:bg-white"
          >
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full border-2 border-slate-500 bg-slate-500 transition motion-reduce:transition-none" />
          </span>
          <span
            className={`text-sm font-semibold text-slate-900 ${compact ? "sr-only map-wide:not-sr-only" : ""}`}
          >
            Ocupação simulada
          </span>
          {compact && (
            <span
              aria-hidden="true"
              className="text-sm font-semibold text-slate-900 map-wide:hidden"
            >
              Simulação
            </span>
          )}
        </label>
        {compact && layer.isEnabled && onOpenLegend && (
          <button
            type="button"
            onClick={onOpenLegend}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-fila-blue underline underline-offset-2 map-wide:hidden"
          >
            Legenda
          </button>
        )}
      </div>
      {/* One short notice, visible wherever simulated data is on screen. In
          the map panel, with the layer off, it stays for screen readers only:
          the panel is the first thing every visitor sees and must leave room
          for the map; on a narrow map it shortens to fit beside the switch.
          The full explanation lives in "Sobre os dados". */}
      <p
        id={hintId}
        className={`text-xs leading-relaxed text-slate-700 ${compact && !layer.isEnabled ? "sr-only" : ""}`}
      >
        {compact ? (
          <>
            <span className="map-wide:hidden">{SIMULATION_NOTICE_SHORT}</span>
            <span className="hidden map-wide:inline">{SIMULATION_NOTICE}</span>
          </>
        ) : (
          SIMULATION_NOTICE
        )}
        {/* A hidden notice must not hold a focusable link. */}
        {!(compact && !layer.isEnabled) && (
          <>
            {" "}
            <Link
              to={ABOUT_SIMULATION}
              className="font-semibold text-fila-blue underline underline-offset-2"
            >
              Saiba mais
            </Link>
          </>
        )}
      </p>
      <LiveStatus message={announcement} delay={0} />

      {layer.isEnabled && collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          aria-controls={secondaryId}
          className="mt-1 min-h-11 text-sm font-semibold text-fila-blue underline underline-offset-2 map-wide:hidden"
        >
          Filtros e legenda{layer.onlySimulated ? " (1 filtro ativo)" : ""}
        </button>
      )}
      {layer.isEnabled && (
        <div
          id={secondaryId}
          className={`mt-2 space-y-1 ${compact ? "hidden map-wide:block" : collapsible && !isExpanded ? "hidden map-wide:block" : ""}`}
        >
          {!response && <p className="text-xs text-slate-700">Carregando…</p>}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={layer.onlySimulated}
              // Filtering before the data arrives would empty the results.
              disabled={!response}
              onChange={(event) => layer.setOnlySimulated(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-occupancy-control"
            />
            Mostrar só unidades com ocupação simulada
            {response && ` (${unitCount.toLocaleString("pt-BR")})`}
          </label>
          <details
            ref={legendRef}
            open={legendOpen}
            className="group scroll-mt-20 text-xs text-slate-700"
          >
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-fila-blue underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              Legenda da situação simulada
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 16 16"
                className="h-4 w-4 transition group-open:rotate-180 motion-reduce:transition-none"
              >
                <path
                  d="M4 6l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </summary>
            <ul className="mt-1 space-y-1.5">
              {OCCUPANCY_STATUSES.map((status) => (
                <li key={status} className="flex items-center gap-2">
                  <OccupancySwatch status={status} />
                  <span>
                    {STATUS_LABELS[status]}
                    {STATUS_RANGES[status] && (
                      <span className="text-slate-600">
                        {" "}
                        ({STATUS_RANGES[status]})
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {!layer.onlySimulated && (
                <li className="flex items-center gap-2">
                  <OccupancySwatch status="neutral" />
                  <span>Sem ocupação simulada</span>
                </li>
              )}
            </ul>
            <p className="mt-2 leading-relaxed">
              {OCCUPANCY_EXPLANATION} {COLOR_NOTICE}
            </p>
            {response && (
              <p className="mt-1 leading-relaxed text-slate-600">
                Sem dados novos há mais de{" "}
                {response.metadata.staleAfterMinutes} minutos, a cor deixa de
                aparecer. {SIMULATION_SOURCE},
                atualizado às {formatTime(response.metadata.generatedAt)}.
              </p>
            )}
          </details>
        </div>
      )}
      {layer.isEnabled && state.status === "error" && (
        <p
          className="mt-1 text-xs text-red-900"
          role={response ? "status" : "alert"}
        >
          {state.message}{" "}
          <button
            type="button"
            onClick={layer.retry}
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            Tentar novamente
          </button>
        </p>
      )}
    </div>
  );
}
