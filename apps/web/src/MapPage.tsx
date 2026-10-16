import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BrazilianStateSelect } from "./BrazilianStateSelect";
import { NationalStateCode, stateName } from "./brazilianStates";
import { LiveStatus } from "./LiveStatus";
import { OccupancyControls } from "./OccupancyControls";
import { UnitsMap } from "./UnitsMap";
import {
  dataOriginNotice,
  filterUnits,
  formatCount,
  hasLocation,
  LOADING_MESSAGE,
} from "./units";
import { usePageHeading } from "./usePageHeading";
import { useOccupancyLayer } from "./useOccupancyLayer";
import { useSearchFilters } from "./useSearchFilters";
import { useUnits } from "./useUnits";
import { SELECTED_UNIT_PARAM } from "./unitLinks";

const title = "Mapa das unidades de pronto atendimento";

export function MapPage() {
  const headingRef = usePageHeading(title);
  const { stateCode, query, setStateCode, setQuery, flush, search } =
    useSearchFilters();
  const [searchParams] = useSearchParams();
  const selectedUnitId = searchParams.get(SELECTED_UNIT_PARAM) ?? undefined;
  // A selected unit coming from a state list may be newer than the national
  // snapshot. Read that UF while the deep link is open so the marker exists.
  const requestState =
    selectedUnitId && stateCode !== NationalStateCode.All
      ? stateCode
      : NationalStateCode.All;
  const { state, retry } = useUnits(requestState);
  const panelRef = useRef<HTMLElement>(null);
  const filtersRef = useRef<HTMLDialogElement>(null);
  const filtersTitleId = useId();
  const [isLegendOpen, setLegendOpen] = useState(false);
  function openFilters(showLegend = false) {
    setLegendOpen(showLegend);
    if (filtersRef.current) filtersRef.current.scrollTop = 0;
    filtersRef.current?.showModal();
  }
  const { byUnit, simulatedFilter } = useOccupancyLayer();

  // The fields answer at once; filtering and redrawing the markers can lag
  // behind them, so typing stays responsive on a phone with the national list.
  // Both are deferred together, so the count and the announcement always come
  // from one consistent pair.
  const deferredQuery = useDeferredValue(query.trim());
  const deferredState = useDeferredValue(stateCode);
  const filteredUnits = useMemo(() => {
    if (state.status !== "success") return [];
    const inState =
      deferredState === NationalStateCode.All
        ? state.response.data
        : state.response.data.filter(
            (unit) => unit.address.state === deferredState,
          );

    const matching = filterUnits(inState, deferredQuery);
    return simulatedFilter
      ? matching.filter((unit) => simulatedFilter.has(unit.id))
      : matching;
  }, [deferredQuery, deferredState, state, simulatedFilter]);

  const mappableCount = useMemo(
    () => filteredUnits.filter(hasLocation).length,
    [filteredUnits],
  );
  const isCountryWide =
    deferredState === NationalStateCode.All &&
    deferredQuery === "" &&
    simulatedFilter === null;
  const originNotice =
    state.status === "success"
      ? dataOriginNotice(state.response.metadata)
      : null;
  const countText = formatCount(
    mappableCount,
    "unidade no mapa",
    "unidades no mapa",
  );
  // One region stays mounted across loading, success and error, so a change of
  // state is announced; the error has its own role="alert".
  const liveMessage =
    state.status === "loading"
      ? LOADING_MESSAGE
      : state.status === "success"
        ? `${formatCount(mappableCount, "resultado", "resultados")} no mapa em ${stateName(deferredState)}`
        : "";

  return (
    <div className="relative min-h-[28rem] w-full flex-1">
      <h1
        ref={selectedUnitId ? undefined : headingRef}
        tabIndex={-1}
        className="sr-only"
      >
        {title}
      </h1>

      {/* Before the map in DOM order so keyboard users reach the search and the
          list link before the map controls. */}
      <section
        ref={panelRef}
        aria-label="Controles do mapa"
        className="absolute left-3 right-3 top-3 z-[900] max-h-[min(22rem,calc(100%-7.5rem))] overflow-y-auto sm:max-h-[calc(100%-7.5rem)] overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 sm:left-6 sm:right-auto sm:top-4 sm:w-96 sm:p-4"
      >
        <form
          role="search"
          aria-label="Buscar no mapa"
          onSubmit={(event) => event.preventDefault()}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-1 sm:gap-3"
        >
          <div className="hidden sm:block">
            <BrazilianStateSelect
              value={stateCode}
              onChange={setStateCode}
              compact
              allOptionLabel={stateName(NationalStateCode.All)}
            />
          </div>
          <label className="block">
            <span className="sr-only text-xs font-semibold text-slate-800 sm:not-sr-only sm:mb-2 sm:block sm:text-sm">
              Buscar no mapa
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onBlur={flush}
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Cidade ou unidade"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 placeholder:text-slate-500 focus-visible:border-fila-blue"
            />
          </label>
          <button
            type="button"
            onClick={() => openFilters()}
            aria-label="Abrir filtros e legenda"
            aria-haspopup="dialog"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-fila-blue sm:hidden"
          >
            Filtros
            {stateCode !== NationalStateCode.All && (
              <span className="rounded bg-slate-100 px-1 text-xs text-slate-700">
                {stateCode}
              </span>
            )}
          </button>
        </form>
        <LiveStatus message={liveMessage} />
        {state.status === "loading" && (
          <p className="mt-2 text-sm text-slate-700 sm:mt-3">
            {LOADING_MESSAGE}
          </p>
        )}
        {state.status === "success" && (
          <div className="mt-2 hidden flex-wrap items-center justify-between gap-x-3 text-xs leading-relaxed text-slate-700 sm:mt-3 sm:flex">
            <p>{countText}.</p>
            <Link
              to={{ pathname: "/units", search }}
              className="-my-2 inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
            >
              Ver em lista
            </Link>
            {originNotice && (
              <p
                className={`w-full ${originNotice.isOutage ? "font-semibold text-amber-800" : "hidden sm:block"}`}
              >
                {originNotice.shortText ?? originNotice.text}
              </p>
            )}
          </div>
        )}
        {originNotice?.isOutage && (
          <p
            className="mt-2 text-xs font-semibold text-amber-800 sm:hidden"
            role="status"
          >
            {originNotice.text}
          </p>
        )}
        <OccupancyControls compact onOpenLegend={() => openFilters(true)} />
        {state.status === "error" && (
          <div className="mt-2 text-sm text-red-900 sm:mt-3" role="alert">
            <p>{state.message}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-1 min-h-11 font-semibold text-fila-blue underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </section>

      {/* The mobile toolbar never expands when the layer is enabled. Longer
          controls live in an explicit modal, with native focus management. */}
      <dialog
        ref={filtersRef}
        aria-labelledby={filtersTitleId}
        onClose={() => setLegendOpen(false)}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl border border-slate-200 bg-white p-0 text-slate-900 backdrop:bg-slate-900/40"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-2">
          <h2 id={filtersTitleId} className="text-lg font-semibold">
            Filtros e legenda
          </h2>
          <button
            type="button"
            onClick={() => filtersRef.current?.close()}
            className="min-h-11 rounded-lg px-3 font-semibold text-fila-blue"
          >
            Voltar ao mapa
          </button>
        </div>
        <div className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {state.status === "success" && (
            <p className="text-sm text-slate-700">{countText}</p>
          )}
          <BrazilianStateSelect
            value={stateCode}
            onChange={setStateCode}
            allOptionLabel={stateName(NationalStateCode.All)}
          />
          <OccupancyControls legendOpen={isLegendOpen} />
          {originNotice && (
            <p className="mt-4 text-xs leading-relaxed text-slate-700">
              {originNotice.text}
            </p>
          )}
        </div>
      </dialog>

      <UnitsMap
        units={filteredUnits}
        selectedUnitId={selectedUnitId}
        listSearch={search}
        occupancy={byUnit}
        isCountryWide={isCountryWide}
        overlayRef={panelRef}
        className="absolute inset-0"
      />
    </div>
  );
}
