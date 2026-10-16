import { useId, useState } from "react";
import { LiveStatus } from "./LiveStatus";
import { OccupancySwatch } from "./OccupancySwatch";
import { SimulationPill } from "./SimulationPill";
import {
  formatTime,
  OCCUPANCY_STATUSES,
  OCCUPANCY_EXPLANATION,
  SIMULATION_NOTICE,
  STATUS_LABELS,
  STATUS_RANGES,
} from "./occupancy";
import { formatCount } from "./units";
import { useOccupancyLayer } from "./useOccupancyLayer";

/**
 * Switch, filter, legend and simulation notice of the "Ocupação simulada de leitos"
 * layer. Renders nothing when the server has the demonstration turned off.
 * The compact variant sits inside the map panel; the list uses a card.
 */
export function OccupancyControls({ compact = false }: { compact?: boolean }) {
  const layer = useOccupancyLayer();
  const hintId = useId();
  // Announced only after the person turns the layer on, once the data is in:
  // not when the page loads with the layer already on, and not on refreshes.
  const [announceCount, setAnnounceCount] = useState(false);
  if (!layer.isAvailable) return null;

  const { state } = layer;
  const { response } = layer;
  const unitCount = response?.data.length ?? 0;
  const simulatedText = `${formatCount(
    unitCount,
    "unidade com ocupação simulada de leitos",
    "unidades com ocupação simulada de leitos",
  )} no Brasil`;
  const announcement =
    announceCount && layer.isEnabled && response ? `${simulatedText}.` : "";

  return (
    <div
      className={
        compact
          ? "mt-2 border-t border-slate-100 pt-2 sm:mt-3 sm:pt-3"
          : "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      }
    >
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
        <span className="text-sm font-semibold text-slate-900">
          Ocupação simulada de leitos
        </span>
      </label>
      {/* Visible wherever simulated data is on screen. In the map panel, with
          the layer off, it stays for screen readers only: the panel is the
          first thing every visitor sees and must leave room for the map. */}
      <p
        id={hintId}
        className={`text-xs leading-relaxed text-slate-700 ${compact && !layer.isEnabled ? "sr-only" : ""}`}
      >
        {SIMULATION_NOTICE}
      </p>
      <LiveStatus message={announcement} delay={0} />

      {layer.isEnabled && (
        <div className="mt-2 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700">
            <SimulationPill />
            {response ? simulatedText : "Carregando…"}
          </p>
          {state.status === "error" && (
            // With data still on screen a failed refresh is only a status; an
            // alert would interrupt the reader on every failed attempt.
            <p
              className="text-xs text-red-900"
              role={response ? "status" : "alert"}
            >
              {state.message}{" "}
              <button
                type="button"
                onClick={layer.retry}
                className="-my-3 inline-flex min-h-11 items-center font-semibold text-fila-blue underline"
              >
                Tentar novamente
              </button>
            </p>
          )}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={layer.onlySimulated}
              onChange={(event) => layer.setOnlySimulated(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-occupancy-control"
            />
            Mostrar só unidades com ocupação simulada de leitos
          </label>
          <details className="group text-xs text-slate-700">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-fila-blue underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              Legenda da ocupação de leitos
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
                  <span>Unidade fora da simulação</span>
                </li>
              )}
            </ul>
            <p className="mt-2 leading-relaxed">
              {OCCUPANCY_EXPLANATION} As faixas são convenções da demonstração e
              não indicam qual unidade procurar.
              {response &&
                ` Sem envio por mais de ${response.metadata.staleAfterMinutes} minutos, a faixa deixa de ser mostrada. Dados atualizados às ${formatTime(response.metadata.generatedAt)}.`}
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
