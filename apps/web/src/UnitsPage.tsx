import { useMemo, useState } from "react";
import { BrazilianStateSelect } from "./BrazilianStateSelect";
import { stateName } from "./brazilianStates";
import {
  formatAddress,
  formatSourceDate,
  type HealthUnit,
  type UnitsResponse,
} from "./units";
import { useUnits } from "./useUnits";

function DataNotice({ metadata }: { metadata: UnitsResponse["metadata"] }) {
  if (!metadata.isStale) return null;

  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      A fonte oficial está temporariamente indisponível. Exibimos a cópia de
      segurança atualizada até {formatSourceDate(metadata.latestSourceUpdate)}.
    </div>
  );
}

function UnitCard({
  unit,
  source,
}: {
  unit: HealthUnit;
  source: UnitsResponse["metadata"]["source"];
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fila-green">
            {unit.unitType}
          </p>
          <h2 className="text-xl font-bold leading-snug text-slate-900">
            {unit.name}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-fila-blue">
          CNES {unit.id}
        </span>
      </div>

      <dl className="flex flex-1 flex-col gap-3 text-sm text-slate-700">
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
            {unit.location.latitude === null || unit.location.longitude === null
              ? "Coordenadas não informadas na fonte pública"
              : "Disponível"}
          </dd>
        </div>
      </dl>

      <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
        Fonte:{" "}
        <a
          className="underline hover:text-fila-blue"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          {source.name}
        </a>
        {" · "}atualizado em {formatSourceDate(unit.lastUpdatedAt)}
      </p>
    </article>
  );
}

export function UnitsPage() {
  const [stateCode, setStateCode] = useState("SP");
  const { state, retry } = useUnits(stateCode);
  const [query, setQuery] = useState("");

  const filteredUnits = useMemo(() => {
    if (state.status !== "success") return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedQuery) return state.response.data;

    return state.response.data.filter((unit) =>
      [unit.name, formatAddress(unit.address), unit.serviceHours]
        .filter(Boolean)
        .some((value) =>
          value!.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
        ),
    );
  }, [query, state]);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12 md:py-16">
      <div className="mb-8 max-w-3xl">
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-fila-green">
          {stateName(stateCode)} · {stateCode}
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-fila-blue md:text-5xl">
          Unidades de pronto atendimento
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          Consulte endereços e horários publicados no Cadastro Nacional de
          Estabelecimentos de Saúde.
        </p>
      </div>

      <div className="mb-8 grid max-w-3xl gap-4 sm:grid-cols-[14rem_1fr]">
        <BrazilianStateSelect value={stateCode} onChange={setStateCode} />
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            Buscar por unidade, cidade ou bairro
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: Osasco ou Vila Mariana"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-fila-blue focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      {state.status === "loading" && (
        <div
          className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600"
          role="status"
        >
          Consultando a fonte oficial…
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
            className="mt-4 rounded-lg bg-fila-blue px-4 py-2 font-semibold text-white hover:bg-blue-800"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-6">
          <DataNotice metadata={state.response.metadata} />
          <p className="text-sm text-slate-600" aria-live="polite">
            {filteredUnits.length}{" "}
            {filteredUnits.length === 1
              ? "unidade encontrada"
              : "unidades encontradas"}
          </p>
          {filteredUnits.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
              Nenhuma unidade corresponde à busca. Tente outro nome, cidade ou
              bairro.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredUnits.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  source={state.response.metadata.source}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
