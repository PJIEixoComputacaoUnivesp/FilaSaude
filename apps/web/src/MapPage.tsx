import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrazilianStateSelect } from "./BrazilianStateSelect";
import { UnitsMap } from "./UnitsMap";
import { formatAddress, formatSourceDate } from "./units";
import { useUnits } from "./useUnits";

export function MapPage() {
  const [selectedState, setSelectedState] = useState("ALL");
  const { state, retry } = useUnits("ALL");
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLElement>(null);

  const filteredUnits = useMemo(() => {
    if (state.status !== "success") return [];
    let list = state.response.data;

    if (selectedState !== "ALL") {
      list = list.filter((unit) => unit.address.state === selectedState);
    }

    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (normalized) {
      list = list.filter((unit) =>
        `${unit.name} ${formatAddress(unit.address)}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalized),
      );
    }

    return list;
  }, [query, selectedState, state]);

  const mapUnits = state.status === "success" ? filteredUnits : [];
  const isCountryWide = selectedState === "ALL" && !query.trim();

  return (
    <main className="relative min-h-[28rem] w-full flex-1">
      <UnitsMap
        units={mapUnits}
        isCountryWide={isCountryWide}
        overlayRef={panelRef}
        className="absolute inset-0"
      />

      <section
        ref={panelRef}
        className="absolute left-3 right-3 top-3 z-[900] rounded-2xl border border-slate-200 bg-white p-3 sm:left-6 sm:right-auto sm:top-4 sm:w-96 sm:p-4"
        aria-label="Busca no mapa"
      >
        <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2 sm:grid-cols-1 sm:gap-3">
          <BrazilianStateSelect
            value={selectedState}
            onChange={setSelectedState}
            compact
            allOptionLabel="Todas as UFs"
          />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-800 sm:mb-2 sm:text-sm">
              Buscar no mapa
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Unidade, cidade ou bairro"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-fila-blue focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
        {state.status === "loading" && (
          <p
            className="mt-2 text-sm text-slate-600 sm:mt-3"
            role="status"
            aria-live="polite"
          >
            Consultando a fonte oficial…
          </p>
        )}
        {state.status === "success" && (
          <div
            className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-xs leading-relaxed text-slate-600 sm:mt-3"
            aria-live="polite"
          >
            <p>
              {
                filteredUnits.filter(
                  (unit) =>
                    unit.location.latitude !== null &&
                    unit.location.longitude !== null,
                ).length
              }{" "}
              unidades no mapa.
            </p>
            <Link
              to="/units"
              className="font-semibold text-fila-blue underline underline-offset-2"
            >
              Ver em lista
            </Link>
            {state.response.metadata.isStale && (
              <p className="mt-1 w-full font-semibold text-amber-800">
                Cópia de segurança até{" "}
                {formatSourceDate(state.response.metadata.latestSourceUpdate)}.
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
    </main>
  );
}
