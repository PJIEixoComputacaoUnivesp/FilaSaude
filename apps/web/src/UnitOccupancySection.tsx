import { useEffect, useId, useState } from "react";
import { OccupancyBadge } from "./OccupancyBadge";
import {
  CATEGORY_LABELS,
  fetchOccupancyHistory,
  formatDateTime,
  formatTime,
  STATUS_COLORS,
  STATUS_LABELS,
  type OccupancyHistoryResponse,
} from "./occupancy";
import { chartSegments, hourlyHistory } from "./occupancyHistory";
import { useOccupancyLayer } from "./useOccupancyLayer";

type HistoryState =
  | { status: "loading" }
  | { status: "success"; response: OccupancyHistoryResponse | null }
  | { status: "error"; message: string };

const CHART_WIDTH = 600;
const CHART_HEIGHT = 160;

/**
 * Current simulated occupancy of a unit, by category, and its history over
 * the public period. Only shown while the layer is on, and only for units of
 * the simulation; every value carries the simulation mark.
 */
export function UnitOccupancySection({ unitCnes }: { unitCnes: string }) {
  const layer = useOccupancyLayer();
  const current = layer.byUnit.get(unitCnes);
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const titleId = useId();
  const chartTitleId = useId();
  const chartDescriptionId = useId();
  // Refetch when the current snapshot changes (the layer refreshes it).
  const observedAt = current?.observedAt;

  useEffect(() => {
    if (!layer.isEnabled || observedAt === undefined) return;
    const controller = new AbortController();
    fetchOccupancyHistory(unitCnes, controller.signal)
      .then((response) => setState({ status: "success", response }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível consultar o histórico.",
        });
      });
    return () => controller.abort();
  }, [layer.isEnabled, unitCnes, observedAt]);

  if (!layer.isEnabled || !current) return null;

  const history = state.status === "success" ? state.response : null;
  const points = history?.data.history ?? [];
  const periodHours = history?.metadata.periodHours ?? 24;
  const generatedAt = history
    ? new Date(history.metadata.generatedAt)
    : new Date();
  const segments = chartSegments(
    points,
    generatedAt,
    periodHours,
    CHART_WIDTH,
    CHART_HEIGHT,
  );
  const rows = hourlyHistory(points);

  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 border-t border-slate-100 pt-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          Ocupação simulada
        </h2>
        <span className="rounded-full bg-occupancy-surface px-2.5 py-1 text-xs font-semibold text-occupancy-ink">
          Simulação acadêmica
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        Dados sintéticos, gerados pelo simulador do projeto para demonstração.
        Não representam a ocupação real desta unidade nem indicam qual unidade
        procurar.
      </p>

      <OccupancyBadge occupancy={current} className="mt-4" />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-sm text-slate-700">
          <caption className="mb-2 text-left text-sm font-semibold text-slate-900">
            Último envio por categoria, às {formatTime(current.observedAt)}
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-slate-900">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Categoria
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Ocupados
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Capacidade
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Percentual
              </th>
            </tr>
          </thead>
          <tbody>
            {current.categories.map((category) => (
              <tr key={category.code} className="border-b border-slate-100">
                <th scope="row" className="py-2 pr-4 font-medium">
                  {CATEGORY_LABELS[category.code]}
                </th>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {category.occupied}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {category.capacity}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {category.capacity > 0
                    ? `${Math.round((category.occupied / category.capacity) * 100)}%`
                    : "Não informado"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {current.confirmation === "stale" && (
        <p className="mt-3 rounded-lg border border-slate-300 bg-fila-bg px-3 py-2 text-sm text-slate-800">
          A fonte simulada não envia dados desde{" "}
          {formatDateTime(current.observedAt)}. Os valores acima são do último
          envio, e a faixa de ocupação deixa de ser mostrada.
        </p>
      )}

      <h3 className="mt-6 text-base font-bold text-slate-900">
        Últimas {periodHours} horas
      </h3>
      {state.status === "loading" && (
        <p className="mt-2 text-sm text-slate-700">Carregando o histórico…</p>
      )}
      {state.status === "error" && (
        <p className="mt-2 text-sm text-red-900" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" && points.length === 0 && (
        <p className="mt-2 text-sm text-slate-700">
          Ainda não há envios no período.
        </p>
      )}
      {points.length > 0 && (
        <>
          <figure className="mt-2">
            <svg
              role="img"
              aria-labelledby={`${chartTitleId} ${chartDescriptionId}`}
              viewBox={`-36 -8 ${CHART_WIDTH + 44} ${CHART_HEIGHT + 32}`}
              className="h-auto w-full"
            >
              <title id={chartTitleId}>
                Ocupação simulada nas últimas {periodHours} horas
              </title>
              <desc id={chartDescriptionId}>
                Percentual de ocupação de cada envio, de{" "}
                {formatDateTime(points[0].occurredAt)} a{" "}
                {formatDateTime(points[points.length - 1].occurredAt)}. A tabela
                a seguir traz um valor por hora.
              </desc>
              {[0, 60, 85, 100].map((value) => {
                const y = CHART_HEIGHT - (value / 100) * CHART_HEIGHT;
                return (
                  <g key={value}>
                    <line
                      x1={0}
                      x2={CHART_WIDTH}
                      y1={y}
                      y2={y}
                      stroke={value === 0 ? "#94a3b8" : "#e2e8f0"}
                      strokeDasharray={
                        value === 60 || value === 85 ? "4 4" : undefined
                      }
                    />
                    <text
                      x={-6}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#475569"
                    >
                      {value}%
                    </text>
                  </g>
                );
              })}
              {segments.map((segment, index) => (
                <polyline
                  key={index}
                  points={segment.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={STATUS_COLORS.high.fill}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ))}
              <text x={0} y={CHART_HEIGHT + 20} fontSize="11" fill="#475569">
                há {periodHours} h
              </text>
              <text
                x={CHART_WIDTH}
                y={CHART_HEIGHT + 20}
                fontSize="11"
                fill="#475569"
                textAnchor="end"
              >
                agora
              </text>
            </svg>
            <figcaption className="mt-1 text-xs text-slate-600">
              Linhas tracejadas: limites das faixas moderada (60%) e alta (85%).
            </figcaption>
          </figure>
          <details className="mt-3 text-sm text-slate-700">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-fila-blue underline underline-offset-2">
              Ver histórico em tabela
            </summary>
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-left">
                <caption className="sr-only">
                  Último envio de cada hora, do mais recente ao mais antigo
                </caption>
                <thead>
                  <tr className="border-b border-slate-200 text-slate-900">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Horário
                    </th>
                    <th
                      scope="col"
                      className="py-2 pr-4 text-right font-semibold"
                    >
                      Ocupação
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Faixa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.occurredAt}
                      className="border-b border-slate-100"
                    >
                      <td className="py-2 pr-4">
                        <time dateTime={row.occurredAt}>
                          {formatDateTime(row.occurredAt)}
                        </time>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.percentage === null ? "—" : `${row.percentage}%`}
                      </td>
                      <td className="py-2">
                        {STATUS_LABELS[row.level ?? "unknown"]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
