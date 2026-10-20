import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useUserLocation } from "./useUserLocation";
import {
  availableSearchRadiiKm,
  distanceOrigin,
  distancesFrom,
  filterUnitsWithinRadius,
  initialSearchRadiusKm,
  nearbyUnavailableReason,
} from "./geo";
import { NearbyRadiusSelect } from "./NearbyRadiusSelect";

const title = "Mapa das unidades de pronto atendimento";

function formatAccuracy(meters: number) {
  return Math.ceil(meters).toLocaleString("pt-BR");
}

export function MapPage() {
  const location = useUserLocation();
  const locationDescriptionId = useId();
  const locationPanelRef = useRef<HTMLElement>(null);
  const headingRef = usePageHeading(title);
  // Always the h1, also when a selected unit keeps it from taking focus on mount.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const {
    stateCode,
    query,
    setStateCode,
    setQuery,
    flush,
    search,
    nearbyEnabled,
    nearbyRadiusKm,
    setNearbyEnabled,
    setNearbyRadiusKm,
  } = useSearchFilters();
  const [searchParams] = useSearchParams();
  const selectedUnitId = searchParams.get(SELECTED_UNIT_PARAM) ?? undefined;
  // A selected unit coming from a state list may be newer than the national
  // snapshot. Read that UF while the deep link is open so the marker exists.
  const requestState =
    !nearbyEnabled && selectedUnitId && stateCode !== NationalStateCode.All
      ? stateCode
      : NationalStateCode.All;
  const { state, retry } = useUnits(requestState);
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDialogElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const filtersOpenerRef = useRef<HTMLElement | null>(null);
  const filtersTitleId = useId();
  const [isLegendOpen, setLegendOpen] = useState(false);
  // Below map-wide the location panel would cover an open popup.
  const [isPopupOpen, setPopupOpen] = useState(false);
  function openFilters(showLegend = false) {
    filtersOpenerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setLegendOpen(showLegend);
    if (filtersRef.current) filtersRef.current.scrollTop = 0;
    filtersRef.current?.showModal();
  }
  const { byUnit, simulatedFilter, setOnlySimulated } = useOccupancyLayer();
  const currentOrigin = distanceOrigin(location.state);
  useEffect(() => {
    if (nearbyEnabled && !currentOrigin) setNearbyEnabled(false);
  }, [nearbyEnabled, currentOrigin, setNearbyEnabled]);
  const nationalUnits = useMemo(
    () => (state.status === "success" ? state.response.data : []),
    [state],
  );
  const initialRadiusKm = useMemo(
    () =>
      currentOrigin && state.status === "success"
        ? initialSearchRadiusKm(
            currentOrigin,
            location.state.status === "success"
              ? location.state.position.accuracy
              : 0,
            nationalUnits,
          )
        : null,
    [currentOrigin, location.state, nationalUnits, state.status],
  );
  const activeRadiusKm = nearbyEnabled
    ? (nearbyRadiusKm ?? initialRadiusKm)
    : null;
  useEffect(() => {
    if (nearbyEnabled && nearbyRadiusKm === null && initialRadiusKm !== null) {
      setNearbyRadiusKm(initialRadiusKm);
    }
  }, [nearbyEnabled, nearbyRadiusKm, initialRadiusKm, setNearbyRadiusKm]);

  // The fields answer at once; filtering and redrawing the markers can lag
  // behind them, so typing stays responsive on a phone with the national list.
  // Both are deferred together, so the count and the announcement always come
  // from one consistent pair.
  const deferredQuery = useDeferredValue(query.trim());
  const deferredState = useDeferredValue(stateCode);
  const distances = useMemo(
    () => (currentOrigin ? distancesFrom(currentOrigin, nationalUnits) : null),
    [currentOrigin, nationalUnits],
  );
  const availableRadii = useMemo(
    () =>
      currentOrigin && state.status === "success"
        ? availableSearchRadiiKm(
            currentOrigin,
            location.state.status === "success"
              ? location.state.position.accuracy
              : 0,
            nationalUnits,
          )
        : [],
    [currentOrigin, location.state, nationalUnits, state.status],
  );
  const filteredUnits = useMemo(() => {
    if (state.status !== "success") return [];
    const inState =
      deferredState === NationalStateCode.All
        ? state.response.data
        : state.response.data.filter(
            (unit) => unit.address.state === deferredState,
          );

    const matching = filterUnits(inState, deferredQuery);
    const withSimulation = simulatedFilter
      ? matching.filter((unit) => simulatedFilter.has(unit.id))
      : matching;
    return nearbyEnabled && activeRadiusKm !== null && distances
      ? filterUnitsWithinRadius(withSimulation, distances, activeRadiusKm)
      : withSimulation;
  }, [
    deferredQuery,
    deferredState,
    state,
    simulatedFilter,
    nearbyEnabled,
    activeRadiusKm,
    distances,
  ]);

  const mappableCount = useMemo(
    () => filteredUnits.filter(hasLocation).length,
    [filteredUnits],
  );
  const unitsAtRadius = useMemo(
    () =>
      nearbyEnabled && activeRadiusKm !== null && distances
        ? filterUnitsWithinRadius(nationalUnits, distances, activeRadiusKm).length
        : 0,
    [nearbyEnabled, activeRadiusKm, distances, nationalUnits],
  );
  const isCountryWide =
    !nearbyEnabled &&
    deferredState === NationalStateCode.All &&
    deferredQuery === "" &&
    simulatedFilter === null;

  const userPosition =
    location.state.status === "success"
      ? location.state.position
      : location.state.status === "loading"
        ? location.state.previous
        : undefined;
  // The person's position frames the map only where the filtered units are
  // (with a margin of about 25 km), so a UF far away still shows its units.
  // Before the list answers, or with no unit to show, there is nothing to
  // compare with.
  const isPositionInArea = useMemo(() => {
    if (!userPosition || nearbyEnabled || isCountryWide || state.status !== "success") {
      return true;
    }
    const located = filteredUnits.filter(hasLocation);
    if (located.length === 0) return true;
    const margin = 0.25;
    const latitudes = located.map((unit) => unit.location.latitude!);
    const longitudes = located.map((unit) => unit.location.longitude!);
    return (
      userPosition.latitude >= Math.min(...latitudes) - margin &&
      userPosition.latitude <= Math.max(...latitudes) + margin &&
      userPosition.longitude >= Math.min(...longitudes) - margin &&
      userPosition.longitude <= Math.max(...longitudes) + margin
    );
  }, [userPosition, nearbyEnabled, isCountryWide, state.status, filteredUnits]);
  const originNotice =
    state.status === "success"
      ? dataOriginNotice(state.response.metadata)
      : null;
  const countText = nearbyEnabled && activeRadiusKm !== null
    ? `${formatCount(mappableCount, "unidade", "unidades")} a até ${activeRadiusKm} km de você, em linha reta`
    : formatCount(
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
        ? `${formatCount(mappableCount, "resultado", "resultados")} ${nearbyEnabled && activeRadiusKm !== null ? `dentro de ${activeRadiusKm} km de você` : `no mapa em ${stateName(deferredState)}`}`
        : "";

  const [removedAnnouncement, setRemovedAnnouncement] = useState("");
  function removeLocation() {
    setRemovedAnnouncement(
      nearbyEnabled
        ? "Localização removida. O filtro Ao redor de você foi desativado."
        : "Localização removida.",
    );
    location.clear();
    // The panel goes away with the position; keep focus on the page.
    titleRef.current?.focus();
  }
  const locationAnnouncement =
    location.state.status === "loading"
      ? location.state.previous
        ? "Atualizando sua localização."
        : "Obtendo sua localização."
      : location.state.status === "error"
        ? location.state.message
        : location.state.status === "success" && !location.state.refining
          ? `Localização encontrada, precisão de cerca de ${formatAccuracy(location.state.position.accuracy)} m.`
          : location.state.status === "removed"
            ? removedAnnouncement
            : "";
  const nearbyHint = nearbyUnavailableReason(location.state);

  // The map's floor follows the height, not the width: a short screen (a phone
  // held sideways, a browser bar) fills the space left, and only a very short
  // one (zoomed in) scrolls instead of crushing the map. Narrow and zoomed in,
  // the floor is taller, so the search and location panels never overlap.
  return (
    <div className="relative min-h-80 w-full flex-1 sm:min-h-56 sm:[@media(min-height:40rem)]:min-h-[28rem]">
      <h1
        ref={(element) => {
          titleRef.current = element;
          if (!selectedUnitId) headingRef.current = element;
        }}
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
        className="map-search-panel absolute left-3 right-3 top-3 z-[900] max-h-[min(22rem,calc(100%-7.5rem))] overflow-y-auto map-wide:max-h-[calc(100%-8.5rem)] overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 map-wide:left-6 map-wide:right-auto map-wide:top-4 map-wide:w-72 map-wide:md:w-96 map-wide:p-4"
      >
        <form
          role="search"
          aria-label="Buscar no mapa"
          onSubmit={(event) => event.preventDefault()}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 map-wide:grid-cols-1 map-wide:gap-3"
        >
          <div className="hidden map-wide:block">
            <BrazilianStateSelect
              value={stateCode}
              onChange={setStateCode}
              compact
              allOptionLabel={stateName(NationalStateCode.All)}
              nearbySelected={nearbyEnabled}
              canSelectNearby={currentOrigin !== null}
              onSelectNearby={() => setNearbyEnabled(true)}
              nearbyHint={nearbyHint}
            />
            {nearbyEnabled && activeRadiusKm !== null && (
              <div className="mt-2">
                <NearbyRadiusSelect
                  compact
                  radiusKm={activeRadiusKm}
                  options={availableRadii}
                  onChange={setNearbyRadiusKm}
                />
              </div>
            )}
          </div>
          <label className="block">
            <span className="sr-only text-xs font-semibold text-slate-800 map-wide:not-sr-only map-wide:mb-2 map-wide:block map-wide:text-sm">
              Buscar no mapa
            </span>
            <input
              type="search"
              ref={searchRef}
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
            ref={filtersButtonRef}
            type="button"
            onClick={() => openFilters()}
            // Starts with the visible word, for voice control.
            aria-label={
              nearbyEnabled
                ? `Filtros e legenda: até ${activeRadiusKm ?? ""} km ao redor de você`
                : stateCode === NationalStateCode.All
                ? "Filtros e legenda"
                : `Filtros e legenda: ${stateName(stateCode)}`
            }
            aria-haspopup="dialog"
            // The chip goes under the word, so the search keeps its width.
            className="inline-flex min-h-11 flex-col items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold leading-tight text-fila-blue map-wide:hidden"
          >
            Filtros
            {(nearbyEnabled || stateCode !== NationalStateCode.All) && (
              <span className="rounded bg-slate-100 px-1 text-xs text-slate-700">
                {nearbyEnabled ? `${activeRadiusKm ?? "…"} km` : stateCode}
              </span>
            )}
          </button>
        </form>
        <LiveStatus message={liveMessage} />
        {state.status === "loading" && (
          <p className="mt-2 text-sm text-slate-700 map-wide:mt-3">
            {LOADING_MESSAGE}
          </p>
        )}
        {state.status === "success" && (
          <div className="mt-2 hidden flex-wrap items-center justify-between gap-x-3 text-xs leading-relaxed text-slate-700 map-wide:mt-3 map-wide:flex">
            <p>{countText}.</p>
            <Link
              to={{ pathname: "/units", search }}
              className="-my-2 inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
            >
              Ver em lista
            </Link>
            {originNotice && (
              <p
                className={`w-full ${originNotice.isOutage ? "font-semibold text-amber-800" : "hidden map-wide:block"}`}
              >
                {originNotice.shortText ?? originNotice.text}
              </p>
            )}
          </div>
        )}
        {nearbyEnabled && activeRadiusKm !== null &&
          (activeRadiusKm >= 100 || unitsAtRadius < 3) && (
            <p className="mt-2 text-xs leading-relaxed text-slate-700">
              O catálogo reúne UPAs e prontos-socorros do CNES. A ausência de
              unidades nesta lista não indica ausência de atendimento na região.
            </p>
          )}
        {nearbyEnabled &&
          activeRadiusKm !== null &&
          ((activeRadiusKm === 500 && unitsAtRadius < 3) ||
            (mappableCount === 0 && deferredQuery !== "")) && (
            <button
              type="button"
              onClick={() => {
                setNearbyEnabled(false);
                setStateCode(NationalStateCode.All);
              }}
              className="mt-2 min-h-11 font-semibold text-fila-blue underline underline-offset-2"
            >
              {deferredQuery !== ""
                ? "Buscar em todo o Brasil"
                : "Mostrar todo o Brasil"}
            </button>
          )}
        {originNotice?.isOutage && (
          <p
            className="mt-2 text-xs font-semibold text-amber-800 map-wide:hidden"
            role="status"
          >
            {originNotice.text}
          </p>
        )}
        {state.status === "success" && mappableCount === 0 && (
          <div className="mt-2 text-sm text-slate-700">
            <p>
              {filteredUnits.length > 0
                ? "As unidades encontradas não têm localização informada."
                : "Nenhuma unidade encontrada com os filtros atuais."}
            </p>
            {filteredUnits.length > 0 ? (
              <Link
                to={{ pathname: "/units", search }}
                className="inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
              >
                Consultar unidades na lista
              </Link>
            ) : query.trim() !== "" ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  flush();
                  searchRef.current?.focus();
                }}
                className="min-h-11 font-semibold text-fila-blue underline underline-offset-2"
              >
                Limpar busca
              </button>
            ) : simulatedFilter ? (
              <button
                type="button"
                onClick={() => {
                  setOnlySimulated(false);
                  searchRef.current?.focus();
                }}
                className="min-h-11 font-semibold text-fila-blue underline underline-offset-2"
              >
                Mostrar todas as unidades
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openFilters()}
                className="min-h-11 font-semibold text-fila-blue underline underline-offset-2"
              >
                Alterar filtros
              </button>
            )}
          </div>
        )}
        {/* Before the layer controls, so the retry stays in view on a short
            panel. */}
        {state.status === "error" && (
          <div className="mt-2 text-sm text-red-900 map-wide:mt-3" role="alert">
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
        <OccupancyControls compact onOpenLegend={() => openFilters(true)} />
      </section>

      {/* Always mounted, apart from the panel, so each change is announced
          once: the precise reading is announced when it settles, not on
          every improvement. */}
      <p role="status" className="sr-only">
        {locationAnnouncement}
      </p>

      {(location.state.status === "loading" ||
        location.state.status === "success" ||
        location.state.status === "error") && (
        <section
          ref={locationPanelRef}
          aria-label="Sua localização"
          aria-describedby={locationDescriptionId}
          className={`map-location-panel absolute bottom-10 right-3 z-[900] max-h-[45%] ${isPopupOpen ? "invisible map-wide:visible" : ""} max-w-[calc(100%-5.5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 sm:right-6 sm:max-w-sm`}
        >
          <p id={locationDescriptionId} className="sr-only">
            Sua posição fica apenas nesta aba.
          </p>
          {location.state.status === "success" && !location.state.refining ? (
            // Settled: one line, so the panel takes little of the map.
            <div className="flex flex-wrap items-center gap-x-2">
              <p className="px-2 text-sm text-slate-700">
                Sua localização (±{" "}
                {formatAccuracy(location.state.position.accuracy)} m)
              </p>
              {/* The actions wrap together, never one per line. */}
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label="Atualizar localização"
                  onClick={location.locate}
                  className="min-h-11 rounded-lg px-2 text-sm font-semibold text-fila-blue underline underline-offset-2"
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  aria-label="Remover localização"
                  onClick={removeLocation}
                  className="min-h-11 rounded-lg px-2 text-sm font-semibold text-slate-700 underline underline-offset-2"
                >
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="px-2 text-sm leading-relaxed text-slate-700">
                {location.state.status === "success"
                  ? `Sua localização está marcada no mapa. Precisão aproximada: ${formatAccuracy(location.state.position.accuracy)} m. Ajustando a precisão…`
                  : location.state.status === "error"
                    ? location.state.message
                    : location.state.status === "loading" && location.state.previous
                      ? "Atualizando sua localização. A posição anterior permanece no mapa até a nova leitura."
                      : "Obtendo sua localização para mostrar sua posição no mapa. Se o navegador perguntar, escolha Permitir."}
              </p>
              <div className="flex flex-wrap items-center gap-x-3">
                {location.state.status === "error" &&
                  location.state.canRetry && (
                    <button
                      type="button"
                      onClick={location.locate}
                      className="min-h-11 rounded-lg px-2 text-sm font-semibold text-fila-blue hover:bg-slate-100"
                    >
                      Tentar novamente
                    </button>
                  )}
                <button
                  type="button"
                  onClick={removeLocation}
                  className="min-h-11 rounded-lg px-2 text-sm font-semibold text-slate-700 underline underline-offset-2"
                >
                  {location.state.status === "loading"
                    ? location.state.previous
                      ? "Remover localização"
                      : "Cancelar localização"
                    : location.state.status === "success"
                      ? "Remover localização"
                      : "Fechar"}
                </button>
              </div>
            </>
          )}
          {location.state.status === "success" && !isPositionInArea && (
            <p className="px-2 text-sm leading-relaxed text-slate-700">
              Você está fora da área filtrada
              {deferredState === NationalStateCode.All
                ? "."
                : ` (${stateName(deferredState)}).`}
            </p>
          )}
        </section>
      )}

      {/* The mobile toolbar never expands when the layer is enabled. Longer
          controls live in an explicit modal, with native focus management. */}
      <dialog
        ref={filtersRef}
        aria-labelledby={filtersTitleId}
        // A tap on the backdrop (outside the sheet) goes back to the map.
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.target === event.currentTarget &&
            (event.clientY < box.top ||
              event.clientY > box.bottom ||
              event.clientX < box.left ||
              event.clientX > box.right)
          ) {
            event.currentTarget.close();
          }
        }}
        onClose={() => {
          setLegendOpen(false);
          if (
            filtersOpenerRef.current &&
            !filtersOpenerRef.current.isConnected
          ) {
            filtersButtonRef.current?.focus();
          }
          filtersOpenerRef.current = null;
        }}
        // A fixed height: the top, with "Voltar ao mapa", stays put while the
        // content changes.
        className="fixed inset-x-0 bottom-0 top-auto m-0 h-[min(85dvh,36rem)] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl border border-slate-200 bg-white p-0 text-slate-900 backdrop:bg-slate-900/40"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <h2 id={filtersTitleId} className="text-base font-semibold sm:text-lg">
            Filtros e legenda
          </h2>
          <button
            type="button"
            onClick={() => filtersRef.current?.close()}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-lg px-2 font-semibold text-fila-blue"
          >
            Voltar ao mapa
          </button>
        </div>
        <div className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {state.status === "success" &&
            !(nearbyEnabled && activeRadiusKm !== null) && (
              <p className="text-sm text-slate-700">{countText}</p>
            )}
          <BrazilianStateSelect
            value={stateCode}
            onChange={setStateCode}
            allOptionLabel={stateName(NationalStateCode.All)}
            nearbySelected={nearbyEnabled}
            canSelectNearby={currentOrigin !== null}
            onSelectNearby={() => setNearbyEnabled(true)}
            nearbyHint={nearbyHint}
          />
          {nearbyEnabled && activeRadiusKm !== null && (
            <NearbyRadiusSelect
              radiusKm={activeRadiusKm}
              options={availableRadii}
              onChange={setNearbyRadiusKm}
            />
          )}
          {nearbyEnabled && activeRadiusKm !== null && (
            <p className="text-sm leading-relaxed text-slate-700">
              {countText}. A lista mostra unidades até esta distância em linha reta.
            </p>
          )}
          <OccupancyControls legendOpen={isLegendOpen} />
          {originNotice && (
            <p className="mt-4 text-xs leading-relaxed text-slate-700">
              {originNotice.text}
            </p>
          )}
        </div>
      </dialog>

      <UnitsMap
        locationPanelRef={locationPanelRef}
        userPosition={userPosition}
        nearbyRadiusKm={activeRadiusKm ?? undefined}
        isPositionInArea={isPositionInArea}
        filterKey={`${deferredState}|${deferredQuery}|${simulatedFilter ? "simulated" : ""}|${nearbyEnabled ? activeRadiusKm ?? "nearby" : ""}`}
        units={filteredUnits}
        selectedUnitId={selectedUnitId}
        linkSearch={search}
        occupancy={byUnit}
        isCountryWide={isCountryWide}
        overlayRef={panelRef}
        onPopupOpenChange={setPopupOpen}
        className="absolute inset-0"
      />
    </div>
  );
}
