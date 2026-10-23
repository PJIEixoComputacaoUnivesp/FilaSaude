import { useEffect, useId, useRef, useState } from "react";
import { OccupancyBadge } from "./OccupancyBadge";
import { SimulationPill } from "./SimulationPill";
import {
  CATEGORY_LABELS,
  COLOR_NOTICE,
  OCCUPANCY_EXPLANATION,
  SIMULATION_NOTICE,
  describeCompletedPeriod,
  fetchOccupancyHistory,
  formatDecimal,
  formatDateTime,
  formatTime,
  occupancyStatus,
  STATUS_LABELS,
  waitingPerSlot,
  type OccupancyHistoryPoint,
  type OccupancyHistoryResponse,
  type UnitOccupancy,
} from "./occupancy";
import { chartSegments, hourlyHistory } from "./occupancyHistory";
import { useOccupancyLayer } from "./useOccupancyLayer";

type HistoryState =
  | { status: "loading" }
  | { status: "success"; response: OccupancyHistoryResponse | null }
  | { status: "error"; message: string };

/**
 * Current simulated situation of a unit: beds by category, people waiting and
 * in service now, attendances completed in an explicit period, and the
 * history over the public period. Only shown while the layer is on, and only for units of
 * the simulation; every value carries the simulation mark and its source.
 */
export function UnitOccupancySection({ unitCnes }: { unitCnes: string }) {
  const layer = useOccupancyLayer();
  const current = layer.byUnit.get(unitCnes);
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const titleId = useId();
  const hasCurrent = current !== undefined;

  const refreshHistory = useRef<(() => void) | null>(null);
  // A unit revision follows its SSE delta or a full reconnect snapshot.
  // Keep one history request in flight and coalesce notifications while slow.
  useEffect(() => {
    if (!layer.isEnabled || !hasCurrent) return;
    const controller = new AbortController();
    let running = false;
    let requested = false;
    const load = async () => {
      requested = true;
      if (running) return;
      running = true;
      try {
        while (requested && !controller.signal.aborted) {
          requested = false;
          try {
            const response = await fetchOccupancyHistory(
              unitCnes,
              controller.signal,
            );
            if (!controller.signal.aborted)
              setState({ status: "success", response });
          } catch (error: unknown) {
            if (controller.signal.aborted) return;
            setState({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Não foi possível consultar o histórico.",
            });
          }
        }
      } finally {
        running = false;
      }
    };
    refreshHistory.current = () => {
      void load();
    };
    return () => {
      refreshHistory.current = null;
      controller.abort();
    };
  }, [layer.isEnabled, unitCnes, hasCurrent]);

  useEffect(() => {
    refreshHistory.current?.();
  }, [
    layer.isEnabled,
    unitCnes,
    hasCurrent,
    layer.historyVersions.get(unitCnes),
  ]);

  if (!layer.isEnabled || !current) return null;

  const source = layer.response?.metadata.source;
  const isStale = occupancyStatus(current) === "stale";
  const history = state.status === "success" ? state.response : null;
  const points = history?.data.history ?? [];
  const periodHours = history?.metadata.periodHours ?? 24;

  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 border-t border-slate-100 pt-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          Ocupação e atendimento simulados
        </h2>
        <SimulationPill />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        {SIMULATION_NOTICE}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        {OCCUPANCY_EXPLANATION} {COLOR_NOTICE}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {source ? `Fonte: ${source.name}. ` : null}As capacidades, os postos de
        atendimento e as faixas são convenções da demonstração, não o inventário
        nem a equipe reais da unidade.
      </p>

      <OccupancyBadge occupancy={current} className="mt-4 sm:max-w-lg" />
      {isStale && (
        <p className="mt-3 rounded-lg border-2 border-dashed border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 sm:max-w-lg">
          A fonte simulada não envia dados desde{" "}
          {formatDateTime(current.observedAt)}. A faixa deixa de ser mostrada;
          os valores abaixo são do último envio.
        </p>
      )}

      <AttendanceSummary occupancy={current} isStale={isStale} />
      <CategoryTable occupancy={current} isStale={isStale} />

      <h3 className="mt-6 text-base font-bold text-slate-900">
        Últimas {periodHours} horas
      </h3>
      {state.status === "loading" && (
        <p className="mt-2 text-sm text-slate-700">Carregando o histórico…</p>
      )}
      {state.status === "error" && (
        <p className="mt-2 text-sm text-red-900" role="status">
          {state.message}
        </p>
      )}
      {state.status === "success" && points.length === 0 && (
        // The current state may come from before the period, or the history
        // may be unavailable: never claim there was no snapshot at all.
        <p className="mt-2 text-sm text-slate-700">
          O histórico das últimas {periodHours} horas não tem envios para
          mostrar. O último envio recebido foi em{" "}
          {formatDateTime(current.observedAt)}.
        </p>
      )}
      {history && points.length > 0 && (
        <HistoryChart
          points={points}
          periodHours={periodHours}
          generatedAt={new Date(history.metadata.generatedAt)}
        />
      )}
    </section>
  );
}

const NOT_INFORMED = "Não informado";

/**
 * Current counts and the completed volume, apart: waiting and in service are
 * people now; completed is a total of the period, never people now and never
 * part of the color.
 */
function AttendanceSummary({
  occupancy,
  isStale,
}: {
  occupancy: UnitOccupancy;
  isStale: boolean;
}) {
  const titleId = useId();
  const attendance = occupancy.attendance ?? null;
  const ratio = waitingPerSlot(attendance);
  const count = (value: number | undefined) =>
    value === undefined ? NOT_INFORMED : String(value);
  const rows = [
    { label: "Pessoas esperando atendimento", value: count(attendance?.waiting) },
    { label: "Pessoas em atendimento", value: count(attendance?.inService) },
    {
      label: "Postos de atendimento ativos",
      value: count(attendance?.serviceSlots),
    },
    {
      label: "Espera por posto",
      value: ratio === null ? NOT_INFORMED : formatDecimal(ratio),
    },
  ];

  return (
    <div className="mt-4 sm:max-w-lg">
      <h3 id={titleId} className="text-sm font-semibold text-slate-900">
        Atendimento agora, às {formatTime(occupancy.observedAt)}
        {isStale && " (sem confirmação recente)"}
      </h3>
      {attendance === null ? (
        <p className="mt-2 text-sm text-slate-700">
          A fonte simulada não informa espera nem atendimento desta unidade.
        </p>
      ) : (
        <dl
          aria-labelledby={titleId}
          className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"
        >
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs">{row.label}</dt>
              <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {attendance?.completed && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Volume do período
          </h3>
          <p className="mt-1 text-sm text-slate-700">
            <span className="font-semibold tabular-nums text-slate-900">
              {attendance.completed.count}
            </span>{" "}
            {attendance.completed.count === 1
              ? "atendimento concluído"
              : "atendimentos concluídos"}{" "}
            {describeCompletedPeriod(attendance.completed)}, até o último envio.
            Conta atendimentos, não pessoas diferentes, e não muda a cor.
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryTable({
  occupancy,
  isStale,
}: {
  occupancy: UnitOccupancy;
  isStale: boolean;
}) {
  const totalOccupied = occupancy.categories.reduce(
    (sum, category) => sum + category.occupied,
    0,
  );
  const totalCapacity = occupancy.categories.reduce(
    (sum, category) => sum + category.capacity,
    0,
  );
  const percent = (occupied: number, capacity: number) =>
    capacity > 0
      ? `${Math.round((occupied / capacity) * 100)}%`
      : "Não informado";

  const categoryRows = [
    ...occupancy.categories.map((category) => ({
      label: CATEGORY_LABELS[category.code],
      occupied: category.occupied,
      capacity: category.capacity,
    })),
    {
      label: "Total das categorias",
      occupied: totalOccupied,
      capacity: totalCapacity,
    },
  ];

  return (
    <div className="mt-4 sm:max-w-lg">
      <div className="sm:hidden">
        <p className="mb-2 text-sm font-semibold text-slate-900">
          Último envio por categoria, às {formatTime(occupancy.observedAt)}
          {isStale && " (sem confirmação recente)"}
        </p>
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 px-3">
          {categoryRows.map((category) => (
            <div key={category.label} className="py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {category.label}
              </h3>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-700">
                <div>
                  <dt className="text-xs">Ocupados</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                    {category.occupied}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs">Simulados</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                    {category.capacity}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs">Percentual</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                    {percent(category.occupied, category.capacity)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[18rem] text-left text-sm text-slate-700">
          <caption className="mb-2 text-left text-sm font-semibold text-slate-900">
            Último envio por categoria, às {formatTime(occupancy.observedAt)}
            {isStale && " (sem confirmação recente)"}
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-slate-900">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Categoria
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Leitos ocupados
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Leitos simulados
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Percentual
              </th>
            </tr>
          </thead>
          <tbody>
            {occupancy.categories.map((category) => (
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
                  {percent(category.occupied, category.capacity)}
                </td>
              </tr>
            ))}
          </tbody>
          {/* The level is computed on this total, not on each category. */}
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
              <th scope="row" className="py-2 pr-4">
                Total das categorias
              </th>
              <td className="py-2 pr-4 text-right tabular-nums">
                {totalOccupied}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {totalCapacity}
              </td>
              <td className="py-2 text-right tabular-nums">
                {percent(totalOccupied, totalCapacity)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const CHART_HEIGHT = 160;
const AXIS_WIDTH = 40;
const LINE_COLOR = "#4c1d95";
const GUIDE_COLOR = "#64748b";

/**
 * The chart is drawn at the width it gets (one SVG unit per pixel), so text
 * and lines keep their size on a phone. A table with one value per hour is
 * its text alternative.
 */
function HistoryChart({
  points,
  periodHours,
  generatedAt,
}: {
  points: OccupancyHistoryPoint[];
  periodHours: number;
  generatedAt: Date;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(600);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () =>
      setWidth(Math.max(240, Math.round(container.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const plotWidth = width - AXIS_WIDTH - 8;
  const segments = chartSegments(
    points,
    generatedAt,
    periodHours,
    plotWidth,
    CHART_HEIGHT,
  );
  const rows = hourlyHistory(points);
  const first = points[0];
  const last = points[points.length - 1];
  const guides = [
    { value: 0, label: "0%" },
    { value: 60, label: "moderada ≥ 60%" },
    { value: 85, label: "alta ≥ 85%" },
    { value: 100, label: "100%" },
  ];

  return (
    <>
      <figure className="mt-2" ref={containerRef}>
        <svg
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          viewBox={`${-AXIS_WIDTH} -10 ${width} ${CHART_HEIGHT + 36}`}
          width={width}
          height={CHART_HEIGHT + 36}
          className="block max-w-full"
        >
          <title id={titleId}>
            Ocupação simulada de leitos nas últimas {periodHours} horas
          </title>
          <desc id={descriptionId}>
            Percentual total de leitos simulados de cada envio, de{" "}
            {formatDateTime(first.occurredAt)} a{" "}
            {formatDateTime(last.occurredAt)}. Os valores por hora estão em "Ver
            histórico em tabela".
          </desc>
          {guides.map(({ value, label }) => {
            const y = CHART_HEIGHT - (value / 100) * CHART_HEIGHT;
            const isThreshold = value === 60 || value === 85;
            return (
              <g key={value}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={y}
                  y2={y}
                  stroke={value === 100 ? "#cbd5e1" : GUIDE_COLOR}
                  strokeDasharray={isThreshold ? "4 4" : undefined}
                />
                <text
                  x={isThreshold ? plotWidth : -6}
                  y={isThreshold ? y - 4 : y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="#475569"
                >
                  {label}
                </text>
              </g>
            );
          })}
          {segments.map((segment, index) => (
            <g key={index}>
              {segment.length > 1 && (
                <polyline
                  points={segment.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={LINE_COLOR}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              )}
              {/* A lone point, or the end of a run, is still visible. */}
              <circle
                cx={segment[segment.length - 1].x}
                cy={segment[segment.length - 1].y}
                r={3.5}
                fill={LINE_COLOR}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          ))}
          <text x={0} y={CHART_HEIGHT + 22} fontSize="12" fill="#475569">
            há {periodHours} h
          </text>
          <text
            x={plotWidth}
            y={CHART_HEIGHT + 22}
            fontSize="12"
            fill="#475569"
            textAnchor="end"
          >
            agora
          </text>
        </svg>
        {points.length < 3 && (
          <figcaption className="mt-1 text-xs text-slate-600">
            Poucos envios até agora; o histórico começa às{" "}
            {formatTime(first.occurredAt)}.
          </figcaption>
        )}
      </figure>
      <details className="group mt-3 text-sm text-slate-700">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-fila-blue underline underline-offset-2 [&::-webkit-details-marker]:hidden">
          Ver histórico em tabela
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
        <div className="mt-2 max-h-80 overflow-auto sm:max-w-lg">
          <table className="w-full text-left">
            <caption className="sr-only">
              Último envio de cada hora, do mais recente ao mais antigo
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-900">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Horário
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Leitos
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Esperando
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Faixa
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.occurredAt} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <time dateTime={row.occurredAt}>
                      {formatDateTime(row.occurredAt)}
                    </time>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {row.percentage === null ? "—" : `${row.percentage}%`}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {row.attendance?.waiting ?? "—"}
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
  );
}
