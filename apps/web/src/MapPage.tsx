import { useMemo, useState } from "react";
import { BrazilianStateSelect } from "./BrazilianStateSelect";
import { UnitsMap } from "./UnitsMap";
import { formatAddress, formatSourceDate } from "./units";
import { useUnits } from "./useUnits";

export function MapPage() {
  const [stateCode, setStateCode] = useState("SP");
  const { state, retry } = useUnits(stateCode);
  const [query, setQuery] = useState("");
  const filteredUnits = useMemo(() => {
    if (state.status !== "success") return [];
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return state.response.data;
    return state.response.data.filter((unit) =>
      `${unit.name} ${formatAddress(unit.address)}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
    );
  }, [query, state]);
  const mapUnits = state.status === "success" ? filteredUnits : [];

  return (
    <main className="relative h-[calc(100vh-73px)] min-h-[34rem] w-full">
      <UnitsMap units={mapUnits} />

      <section
        className="absolute left-4 right-4 top-4 z-[900] rounded-2xl border border-slate-200 bg-white p-4 sm:left-6 sm:right-auto sm:w-96"
        aria-label="Busca no mapa"
      >
        <BrazilianStateSelect value={stateCode} onChange={setStateCode} />
        <label className="block">
          <span className="mb-2 mt-3 block text-sm font-semibold text-slate-800">
            Buscar no mapa
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Unidade, cidade ou bairro"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-fila-blue focus:ring-2 focus:ring-blue-100"
          />
        </label>
        {state.status === "loading" && (
          <p
            className="mt-3 text-sm text-slate-600"
            role="status"
            aria-live="polite"
          >
            Consultando a fonte oficial…
          </p>
        )}
        {state.status === "success" && (
          <div
            className="mt-3 text-xs leading-relaxed text-slate-600"
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
            {state.response.metadata.isStale && (
              <p className="mt-1 font-semibold text-amber-800">
                Cópia de segurança até{" "}
                {formatSourceDate(state.response.metadata.latestSourceUpdate)}.
              </p>
            )}
          </div>
        )}
        {state.status === "error" && (
          <div className="mt-3 text-sm text-red-900" role="alert">
            <p>{state.message}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-2 font-semibold text-fila-blue underline"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
