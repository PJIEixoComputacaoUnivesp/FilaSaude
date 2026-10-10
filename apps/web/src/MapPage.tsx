import { useDeferredValue, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { BrazilianStateSelect } from "./BrazilianStateSelect";
import { NationalStateCode, stateName } from "./brazilianStates";
import { LiveStatus } from "./LiveStatus";
import { UnitsMap } from "./UnitsMap";
import {
  dataOriginNotice,
  filterUnits,
  formatCount,
  hasLocation,
  LOADING_MESSAGE,
} from "./units";
import { usePageHeading } from "./usePageHeading";
import { useSearchFilters } from "./useSearchFilters";
import { useUnits } from "./useUnits";

const title = "Mapa das unidades de pronto atendimento";

export function MapPage() {
  const headingRef = usePageHeading(title);
  const { stateCode, query, setStateCode, setQuery, flush, search } =
    useSearchFilters();
  const { state, retry } = useUnits(NationalStateCode.All);
  const panelRef = useRef<HTMLElement>(null);

  // The field answers at once; filtering and redrawing the markers can lag
  // behind it, so typing stays responsive on a phone with the national list.
  const deferredQuery = useDeferredValue(query.trim());
  const filteredUnits = useMemo(() => {
    if (state.status !== "success") return [];
    const inState =
      stateCode === NationalStateCode.All
        ? state.response.data
        : state.response.data.filter((unit) => unit.address.state === stateCode);

    return filterUnits(inState, deferredQuery);
  }, [deferredQuery, stateCode, state]);

  const mappableCount = useMemo(
    () => filteredUnits.filter(hasLocation).length,
    [filteredUnits],
  );
  const isCountryWide =
    stateCode === NationalStateCode.All && deferredQuery === "";
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
        ? `${formatCount(mappableCount, "resultado", "resultados")} no mapa em ${stateName(stateCode)}`
        : "";

  return (
    <div className="relative min-h-[28rem] w-full flex-1">
      <h1 ref={headingRef} tabIndex={-1} className="sr-only">
        {title}
      </h1>

      {/* Before the map in DOM order so keyboard users reach the search and the
          list link before the map controls. */}
      <section
        ref={panelRef}
        className="absolute left-3 right-3 top-3 z-[900] rounded-2xl border border-slate-200 bg-white p-3 sm:left-6 sm:right-auto sm:top-4 sm:w-96 sm:p-4"
      >
        <form
          role="search"
          aria-label="Buscar no mapa"
          onSubmit={(event) => event.preventDefault()}
          className="grid gap-2 min-[360px]:grid-cols-[minmax(0,8.75rem)_1fr] sm:grid-cols-1 sm:gap-3"
        >
          <BrazilianStateSelect
            value={stateCode}
            onChange={setStateCode}
            compact
            allOptionLabel={stateName(NationalStateCode.All)}
          />
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
        </form>
        <LiveStatus message={liveMessage} />
        {state.status === "loading" && (
          <p className="mt-2 text-sm text-slate-700 sm:mt-3">
            {LOADING_MESSAGE}
          </p>
        )}
        {state.status === "success" && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 text-xs leading-relaxed text-slate-700 sm:mt-3">
            <p>{countText}.</p>
            <Link
              to={{ pathname: "/units", search }}
              className="-my-2 inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
            >
              Ver em lista
            </Link>
            {originNotice && (
              <p
                className={`w-full ${originNotice.isOutage ? "font-semibold text-amber-800" : ""}`}
              >
                {originNotice.shortText ?? originNotice.text}
              </p>
            )}
          </div>
        )}
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

      <UnitsMap
        units={filteredUnits}
        isCountryWide={isCountryWide}
        overlayRef={panelRef}
        className="absolute inset-0"
      />
    </div>
  );
}
