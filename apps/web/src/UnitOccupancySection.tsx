import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { OccupancySwatch } from "./OccupancySwatch";
import {
  ABOUT_SIMULATION,
  CATEGORY_LABELS,
  SERVICE_LABELS,
  SIMULATION_NOTICE,
  SIMULATION_SOURCE,
  describeCompletedPeriod,
  describeOccupancy,
  describeWaitComparison,
  describeWaitEstimate,
  fetchOccupancyHistory,
  formatDateTime,
  formatTime,
  occupancyStatus,
  waitingStatus,
  STATUS_LABELS,
  type OccupancyHistoryPoint,
  type OccupancyHistoryResponse,
  type OccupancyStatus,
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
 * the simulation. The title, one short notice and the source line under it
 * mark the whole section; the values inside do not repeat it, and the full
 * explanation lives in "Sobre os dados".
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

  const status = occupancyStatus(current);
  const isStale = status === "stale";
  const history = state.status === "success" ? state.response : null;
  const points = history?.data.history ?? [];
  const periodHours = history?.metadata.periodHours ?? 24;

  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 border-t border-slate-100 pt-5"
    >
      <h2 id={titleId} className="text-lg font-bold text-slate-900">
        Ocupação e atendimento simulados
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        {SIMULATION_SOURCE} · {isStale ? "último envio em " : "enviado às "}
        <time dateTime={current.observedAt}>
          {isStale
            ? formatDateTime(current.observedAt)
            : formatTime(current.observedAt)}
        </time>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        {SIMULATION_NOTICE}{" "}
        <Link
          to={ABOUT_SIMULATION}
          className="font-semibold text-fila-blue underline underline-offset-2"
        >
          Como ler estes dados
        </Link>
      </p>
      {isStale && (
        <p className="mt-3 rounded-xl border-2 border-dashed border-slate-400 bg-white px-3 py-2 text-sm text-slate-900">
          Sem dados novos desde {formatDateTime(current.observedAt)}. A cor não
          é mostrada e os valores abaixo são do último envio.
        </p>
      )}

      <AttendanceSummary occupancy={current} status={status} />
      <ServicesSummary occupancy={current} />
      <CategoryTable occupancy={current} isStale={isStale} />

      <h3 className="mt-6 text-sm font-semibold text-slate-900">
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
  status,
}: {
  occupancy: UnitOccupancy;
  status: OccupancyStatus;
}) {
  const titleId = useId();
  const isStale = status === "stale";
  const attendance = occupancy.attendance ?? null;
  const count = (value: number | undefined) =>
    value === undefined ? NOT_INFORMED : String(value);
  const slots = attendance?.serviceSlots;
  const installed = attendance?.installedServiceSlots;
  const capacity = (value: number | undefined) =>
    value === undefined
      ? "Não informada"
      : `${value === 1 ? "1 pessoa" : `${value} pessoas`} simultaneamente`;
  const comparison = describeWaitComparison(occupancy);
  const usual = occupancy.waitComparison;
  const rows = [
    {
      label: "Espera estimada até o início do atendimento",
      value: describeWaitEstimate(occupancy),
      wide: true,
    },
    ...(comparison === null
      ? []
      : [{ label: "Comparação com o habitual", value: comparison, wide: true }]),
    { label: "Pessoas esperando", value: count(attendance?.waiting) },
    { label: "Pessoas em atendimento", value: count(attendance?.inService) },
    {
      label: "Capacidade de atendimento",
      value: (
        <dl className="space-y-1 font-normal">
          <div>
            <dt className="inline">Em operação: </dt>
            <dd className="inline font-semibold">
              {slots === undefined ? "Não informada" : `até ${capacity(slots)}`}
              .
            </dd>
          </div>
          <div>
            <dt className="inline">Capacidade total do cenário: </dt>
            <dd className="inline font-semibold">{capacity(installed)}.</dd>
          </div>
        </dl>
      ),
      wide: true,
    },
  ];

  return (
    <div className="mt-5">
      <h3 id={titleId} className="text-sm font-semibold text-slate-900">
        Atendimento agora
      </h3>
      <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <OccupancySwatch status={status} />
        {describeOccupancy(occupancy)}
      </p>
      {attendance === null ? (
        <p className="mt-2 text-sm text-slate-700">
          Esta unidade não informou fila nem atendimento.
        </p>
      ) : (
        <dl
          aria-labelledby={titleId}
          className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"
        >
          {rows.map((row) => (
            <div key={row.label} className={row.wide ? "col-span-2" : ""}>
              <dt className="text-xs">{row.label}</dt>
              <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        A espera estimada não mede a espera de ninguém e não é previsão para
        pessoas reais.
      </p>
      {occupancy.waitEstimate?.status === "available" && !isStale && (
        <details className="group mt-1 text-xs leading-relaxed text-slate-600">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-fila-blue underline underline-offset-2 [&::-webkit-details-marker]:hidden">
            Como a estimativa é calculada
            <Chevron />
          </summary>
          <p>
            A fila de agora é dividida pelo ritmo com que os atendimentos
            começaram há pouco: {occupancy.waitEstimate.started} começaram de{" "}
            {formatDateTime(occupancy.waitEstimate.windowStart)} a{" "}
            {formatDateTime(occupancy.waitEstimate.windowEnd)} (horário de
            Brasília), em {occupancy.waitEstimate.sampleCount} envios. Se o
            ritmo mudar, a espera muda.
          </p>
          {usual && usual.status !== "unavailable" && (
            <p className="mt-2">
              O habitual vem de {usual.sampleCount} leituras simuladas desta
              unidade, de {formatDateTime(usual.windowStart)} a{" "}
              {formatDateTime(usual.windowEnd)} (horário de Brasília): metade
              ficou em até {usual.typicalMinutes} min e 9 em cada 10, em até{" "}
              {usual.upperMinutes} min. A comparação não considera outras
              unidades e não muda a cor nem a ordem da lista.
            </p>
          )}
        </details>
      )}
      {attendance?.completed && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Atendimentos concluídos
          </h3>
          <p className="mt-1 text-sm text-slate-700">
            <span className="font-semibold tabular-nums text-slate-900">
              {attendance.completed.count}
            </span>{" "}
            {attendance.completed.count === 1
              ? "atendimento concluído"
              : "atendimentos concluídos"}{" "}
            {describeCompletedPeriod(attendance.completed)}, até o último envio.
            Conta atendimentos, não pessoas.
          </p>
        </div>
      )}
    </div>
  );
}

/** Services of the scenario; installed slots live with the attendance. */
function ServicesSummary({ occupancy }: { occupancy: UnitOccupancy }) {
  const services = occupancy.attendance?.services;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-slate-900">
        Serviços disponíveis
      </h3>
      <div className="mt-1 text-sm text-slate-900">
        {services === undefined ? (
          "Não informados"
        ) : services.length === 0 ? (
          "Nenhum serviço disponível"
        ) : (
          <ul className="list-inside list-disc">
            {services.map((code) => (
              <li key={code}>{SERVICE_LABELS[code]}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        A lista não confirma o que a unidade oferece de verdade.
      </p>
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
    <div className="mt-5">
      <div className="sm:hidden">
        <p className="mb-2 text-sm font-semibold text-slate-900">
          Leitos por categoria, às {formatTime(occupancy.observedAt)}
          {isStale && " (sem dados recentes)"}
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
                  <dt className="text-xs">Total</dt>
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
            Leitos por categoria, às {formatTime(occupancy.observedAt)}
            {isStale && " (sem dados recentes)"}
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
                Total de leitos
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
          {/* Bed totals are complementary; they do not set the queue color. */}
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
            return (
              <g key={value}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={y}
                  y2={y}
                  className={
                    value === 100 ? "stroke-slate-300" : "stroke-slate-500"
                  }
                />
                <text
                  x={-6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  className="fill-slate-600"
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
                  className="stroke-occupancy-ink"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              )}
              {/* A lone point, or the end of a run, is still visible. */}
              <circle
                cx={segment[segment.length - 1].x}
                cy={segment[segment.length - 1].y}
                r={3.5}
                className="fill-occupancy-ink stroke-white"
                strokeWidth={1.5}
              />
            </g>
          ))}
          <text
            x={0}
            y={CHART_HEIGHT + 22}
            fontSize="12"
            className="fill-slate-600"
          >
            há {periodHours} h
          </text>
          <text
            x={plotWidth}
            y={CHART_HEIGHT + 22}
            fontSize="12"
            className="fill-slate-600"
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
          <Chevron />
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
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Leitos
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Esperando
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Nível da espera
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
                    {STATUS_LABELS[waitingStatus(row.attendance)]}
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

function Chevron() {
  return (
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
  );
}
