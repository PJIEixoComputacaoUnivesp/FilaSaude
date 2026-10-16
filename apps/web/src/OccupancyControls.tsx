import { useId } from "react";
import { LiveStatus } from "./LiveStatus";
import { OccupancySwatch } from "./OccupancySwatch";
import {
  formatTime,
  OCCUPANCY_STATUSES,
  STATUS_LABELS,
  STATUS_RANGES,
} from "./occupancy";
import { formatCount } from "./units";
import { useOccupancyLayer } from "./useOccupancyLayer";

/**
 * Switch, legend and simulation notice of the "Ocupação simulada" layer.
 * Renders nothing when the server has the demonstration turned off. The
 * compact variant fits the map panel; the list uses the full one.
 */
export function OccupancyControls({ compact = false }: { compact?: boolean }) {
  const layer = useOccupancyLayer();
  const hintId = useId();
  if (!layer.isAvailable) return null;

  const { state } = layer;
  const response =
    state.status === "success" || state.status === "error"
      ? state.response
      : null;
  const unitCount = response?.data.length ?? 0;
  const announcement = !layer.isEnabled
    ? ""
    : response
      ? `Ocupação simulada ativada: ${formatCount(unitCount, "unidade com dados simulados", "unidades com dados simulados")}.`
      : "Carregando a ocupação simulada…";

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
          onChange={(event) => layer.setEnabled(event.target.checked)}
          aria-describedby={hintId}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-slate-500 bg-white transition peer-checked:border-occupancy-high peer-checked:bg-occupancy-high peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fila-blue motion-reduce:transition-none peer-checked:[&>span]:translate-x-5 peer-checked:[&>span]:bg-white"
        >
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-slate-500 transition motion-reduce:transition-none" />
        </span>
        <span className="text-sm font-semibold text-slate-900">
          Ocupação simulada
        </span>
      </label>
      <p
        id={hintId}
        className={`text-xs leading-relaxed text-slate-700 ${compact && layer.isEnabled ? "sr-only" : ""}`}
      >
        Demonstração acadêmica com dados sintéticos, gerados por um simulador.
        Não é a ocupação real das unidades.
      </p>
      <LiveStatus message={announcement} />

      {layer.isEnabled && (
        <div className="mt-2 space-y-2">
          <p className="text-xs leading-relaxed text-slate-700">
            <span className="inline-flex rounded-full bg-occupancy-surface px-2 py-0.5 font-semibold text-occupancy-ink">
              Simulação acadêmica
            </span>{" "}
            {response
              ? `${formatCount(unitCount, "unidade", "unidades")} · consultado às ${formatTime(response.metadata.generatedAt)}`
              : "Carregando…"}
          </p>
          {state.status === "error" && (
            <p className="text-xs text-red-900" role="alert">
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
              className="h-5 w-5 shrink-0 accent-occupancy-high"
            />
            Mostrar só as unidades da simulação
          </label>
          <details className="group text-xs text-slate-700" open={!compact}>
            <summary className="-my-2 inline-flex min-h-11 cursor-pointer items-center font-semibold text-slate-900">
              Legenda da ocupação
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
            </ul>
            <p className="mt-2 leading-relaxed">
              Percentual ocupado da capacidade informada em observação,
              estabilização e internação.
              {response &&
                ` Sem envio por mais de ${response.metadata.staleAfterMinutes} minutos, a faixa deixa de ser mostrada.`}{" "}
              A ocupação não indica qual unidade procurar.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
