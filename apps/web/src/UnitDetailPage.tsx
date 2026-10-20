import { Link, useParams } from "react-router-dom";
import { NationalStateCode } from "./brazilianStates";
import { distanceOrigin, distanceToUnit, formatUnitDistance } from "./geo";
import { LiveStatus } from "./LiveStatus";
import { UnitOccupancySection } from "./UnitOccupancySection";
import { UnitSources } from "./UnitSources";
import { unitListLink, unitMapLink } from "./unitLinks";
import {
  dataOriginNotice,
  formatAddress,
  formatPosition,
  hasLocation,
  LOADING_MESSAGE,
} from "./units";
import { usePageHeading } from "./usePageHeading";
import { useSearchFilters } from "./useSearchFilters";
import { useUnits } from "./useUnits";
import { useUserLocation } from "./useUserLocation";

export function UnitDetailPage() {
  const { unitId = "" } = useParams();
  const { stateCode, search } = useSearchFilters();
  const { state, retry } = useUnits(
    stateCode === NationalStateCode.All ? NationalStateCode.All : stateCode,
  );
  const unit =
    state.status === "success"
      ? state.response.data.find((candidate) => candidate.id === unitId)
      : undefined;
  const heading =
    state.status === "success" && !unit
      ? "Unidade não encontrada"
      : (unit?.name ?? "Detalhe da unidade");
  const headingRef = usePageHeading(heading);
  const origin = distanceOrigin(useUserLocation().state);
  const distance =
    unit && origin
      ? formatUnitDistance(unit, distanceToUnit(origin, unit))
      : null;
  const notice =
    state.status === "success"
      ? dataOriginNotice(state.response.metadata)
      : null;
  const liveMessage =
    state.status === "loading"
      ? LOADING_MESSAGE
      : state.status === "success"
        ? unit
          ? `Detalhes de ${unit.name} carregados.`
          : "Unidade não encontrada."
        : "";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 md:py-10">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-bold leading-tight text-fila-blue focus:outline-none sm:text-3xl"
      >
        {heading}
      </h1>
      <LiveStatus message={liveMessage} />

      {state.status === "success" && unit && (
        <nav
          aria-label="Navegação da unidade"
          className="mt-4 flex flex-wrap gap-x-5 gap-y-2"
        >
          <Link
            to={unitListLink(unit.id, search)}
            className="inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
          >
            Voltar à lista
          </Link>
          {hasLocation(unit) && (
            <Link
              to={unitMapLink(unit.id, search)}
              className="inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
            >
              Ver no mapa
              <span className="sr-only">: {unit.name}</span>
            </Link>
          )}
        </nav>
      )}

      {state.status === "loading" && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-700">
          {LOADING_MESSAGE}
        </p>
      )}

      {state.status === "error" && (
        <div
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-950"
          role="alert"
        >
          <p>{state.message}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 min-h-11 rounded-lg bg-fila-blue px-4 py-2 font-semibold text-white hover:bg-blue-800"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {state.status === "success" && !unit && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-700">
          <p>
            Não encontramos uma unidade com o código CNES informado nesta
            consulta.
          </p>
          <Link
            to={{ pathname: "/units", search }}
            className="mt-4 inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
          >
            Voltar à lista
          </Link>
        </div>
      )}

      {state.status === "success" && unit && (
        <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-fila-green-ink">
              {unit.unitType}
            </p>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-fila-blue">
              CNES {unit.id}
            </span>
          </div>

          {notice && (
            <p
              className={`mt-5 rounded-xl border px-4 py-3 text-sm ${notice.isOutage ? "border-amber-300 bg-amber-50 font-medium text-amber-950" : "border-slate-200 bg-fila-bg text-slate-700"}`}
              role={notice.isOutage ? "status" : undefined}
            >
              {notice.text}
            </p>
          )}

          <dl className="mt-6 grid gap-5 text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-900">Endereço</dt>
              <dd className="mt-1">{formatAddress(unit.address)}</dd>
            </div>
            {distance && (
              <div>
                <dt className="font-semibold text-slate-900">
                  Distância de você
                </dt>
                <dd className="mt-1">{distance}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-slate-900">
                Horário informado
              </dt>
              <dd className="mt-1">
                {unit.serviceHours ?? "Não informado na fonte pública"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-slate-900">
                Localização no mapa
              </dt>
              <dd className="mt-1">{formatPosition(unit)}</dd>
            </div>
          </dl>

          {/* Keyed: another unit starts from an empty history, never with
              the previous unit's chart. */}
          <UnitOccupancySection key={unit.id} unitCnes={unit.id} />

          <UnitSources
            sources={unit.sources}
            className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-sm leading-relaxed text-slate-600"
          />
        </article>
      )}
    </div>
  );
}
