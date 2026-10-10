import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { BrazilianStateSelect } from "./BrazilianStateSelect";
import { NationalStateCode, stateName } from "./brazilianStates";
import { LiveStatus } from "./LiveStatus";
import { UnitSources } from "./UnitSources";
import {
  dataOriginNotice,
  filterUnits,
  formatAddress,
  formatPosition,
  sortUnits,
  type HealthUnit,
  type UnitsResponse,
} from "./units";
import { usePageHeading } from "./usePageHeading";
import { useSearchFilters } from "./useSearchFilters";
import { useUnits } from "./useUnits";

const PAGE_SIZE = 24;

function DataNotice({ metadata }: { metadata: UnitsResponse["metadata"] }) {
  const notice = dataOriginNotice(metadata);
  if (!notice) return null;

  // The national copy is by design, so it is plain text; only a real outage
  // of the official source gets the warning surface.
  if (!notice.isOutage) {
    return <p className="text-sm text-slate-700">{notice.text}</p>;
  }

  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      {notice.text}
    </div>
  );
}

function UnitCard({
  unit,
  headingRef,
}: {
  unit: HealthUnit;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 sm:mb-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fila-green-ink">
            {unit.unitType}
          </p>
          <h2
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
            className="break-words text-lg font-bold leading-snug text-slate-900 sm:text-xl"
          >
            {unit.name}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-fila-blue">
          CNES {unit.id}
        </span>
      </div>

      <dl className="flex flex-1 flex-col gap-2 text-sm text-slate-700 sm:gap-3">
        <div>
          <dt className="font-semibold text-slate-900">Endereço</dt>
          <dd>{formatAddress(unit.address)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">Horário informado</dt>
          <dd>{unit.serviceHours ?? "Não informado na fonte pública"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">Localização no mapa</dt>
          <dd>
            {formatPosition(unit)}
          </dd>
        </div>
      </dl>

      <UnitSources
        sources={unit.sources}
        className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600 sm:mt-5 sm:pt-4"
      />
    </article>
  );
}

/**
 * Cards with progressive loading. The parent remounts it (via `key`) when the
 * search changes, which resets the page size and the focus target.
 */
function UnitResults({ units }: { units: HealthUnit[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Index of the first card added by "Mostrar mais", which receives focus so
  // keyboard and screen reader users land on the new results.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const focusHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusIndex !== null) focusHeadingRef.current?.focus();
  }, [focusIndex]);

  return (
    <>
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        {units.slice(0, visibleCount).map((unit, index) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            headingRef={index === focusIndex ? focusHeadingRef : undefined}
          />
        ))}
      </div>
      {visibleCount < units.length && (
        <div className="flex flex-col items-center gap-2 text-sm text-slate-600">
          <p>
            Mostrando {visibleCount} de {units.length.toLocaleString("pt-BR")}{" "}
            unidades
          </p>
          <button
            type="button"
            onClick={() => {
              setFocusIndex(visibleCount);
              setVisibleCount(visibleCount + PAGE_SIZE);
            }}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 transition hover:border-fila-blue hover:text-fila-blue sm:w-auto"
          >
            Mostrar mais unidades
          </button>
        </div>
      )}
    </>
  );
}

export function UnitsPage() {
  const headingRef = usePageHeading("Unidades de pronto atendimento");
  const { stateCode, query, setStateCode, setQuery } = useSearchFilters();
  const { state, retry } = useUnits(stateCode);

  const filteredUnits = useMemo(() => {
    if (state.status !== "success") return [];
    return sortUnits(filterUnits(state.response.data, query));
  }, [query, state]);

  const countText = `${stateName(stateCode)}: ${filteredUnits.length.toLocaleString("pt-BR")} ${
    filteredUnits.length === 1 ? "unidade encontrada" : "unidades encontradas"
  }`;
  // One region stays mounted across loading, success and error, so a change of
  // state is announced; the error has its own role="alert".
  const liveMessage =
    state.status === "loading"
      ? "Carregando unidades…"
      : state.status === "success"
        ? countText
        : "";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:py-10">
      <div className="mb-5 max-w-3xl md:mb-6">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight text-fila-blue focus:outline-none sm:text-3xl"
        >
          Unidades de pronto atendimento
        </h1>
        <p className="mt-2 hidden leading-relaxed text-slate-700 sm:block">
          Endereços e horários publicados no Cadastro Nacional de
          Estabelecimentos de Saúde (CNES).
        </p>
      </div>

      <form
        role="search"
        aria-label="Buscar unidades"
        onSubmit={(event) => event.preventDefault()}
        className="mb-6 grid max-w-3xl gap-4 sm:grid-cols-[14rem_1fr] md:mb-8"
      >
        <BrazilianStateSelect
          value={stateCode}
          onChange={setStateCode}
          allOptionLabel={stateName(NationalStateCode.All)}
        />
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            Buscar por unidade, cidade ou bairro
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Ex.: Osasco ou Vila Mariana"
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 focus-visible:border-fila-blue"
          />
        </label>
      </form>

      <LiveStatus message={liveMessage} />

      {/* Reserves the height of a results screen so the footer does not
          jump when the cards replace the short loading state. */}
      <div className="min-h-[60dvh]">
        {state.status === "loading" && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-700">
            Carregando unidades…
          </div>
        )}

        {state.status === "error" && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-950"
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

        {state.status === "success" && (
          <div className="flex flex-col gap-4 sm:gap-6">
            <DataNotice metadata={state.response.metadata} />
            <p className="text-sm text-slate-700">{countText}</p>
            {filteredUnits.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-700">
                <p>
                  Nenhuma unidade corresponde à busca. Tente outro nome, cidade
                  ou bairro.
                </p>
                {query.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="mt-4 min-h-11 rounded-xl border border-slate-300 bg-white px-6 py-2 font-semibold text-slate-800 hover:border-fila-blue hover:text-fila-blue"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              <UnitResults
                key={`${stateCode}|${query}`}
                units={filteredUnits}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
