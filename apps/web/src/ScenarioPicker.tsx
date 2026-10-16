import { useId, useRef, useState } from "react";
import { formatTime } from "./occupancy";
import { useOccupancyLayer } from "./useOccupancyLayer";

/**
 * Lets any visitor choose what the simulator plays. The choice reaches
 * everyone on the site, so it is applied with a button (arrow keys on a
 * select would send one change per option) and the text says so.
 */
export function ScenarioPicker() {
  const { control, changeScenario } = useOccupancyLayer();
  const selectId = useId();
  const descriptionId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const [isBusy, setBusy] = useState(false);

  if (!control) return null;

  const selected = chosen ?? control.scenario;
  const scenario = control.scenarios.find(({ id }) => id === selected);
  const current = control.scenarios.find(({ id }) => id === control.scenario);
  const defaultLabel =
    control.scenarios.find(({ id }) => id === control.defaultScenario)?.label ??
    control.defaultScenario;
  const isCurrent = selected === control.scenario;

  const apply = async () => {
    // aria-disabled keeps the focus on the button while the change runs.
    if (busy.current || isCurrent) return;
    busy.current = true;
    setBusy(true);
    const result = await changeScenario(selected);
    busy.current = false;
    setBusy(false);
    if (result.status === "changed") {
      setChosen(null);
      setMessage(
        `Cenário trocado para "${scenario?.label ?? selected}". O mapa se atualiza em alguns segundos.`,
      );
    } else if (result.status === "cooldown") {
      setMessage(
        `O cenário acabou de ser trocado. Tente de novo em ${result.retryAfterSeconds} segundos.`,
      );
    } else {
      setMessage(result.message);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <label
        htmlFor={selectId}
        className="block text-sm font-semibold text-slate-900"
      >
        Cenário da simulação
      </label>
      <div className="mt-1 flex gap-2">
        <select
          id={selectId}
          value={selected}
          onChange={(event) => {
            setChosen(event.target.value);
            setMessage("");
          }}
          aria-describedby={descriptionId}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
        >
          {control.scenarios.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={apply}
          aria-disabled={isCurrent || isBusy}
          className="min-h-11 shrink-0 rounded-lg bg-occupancy-control px-3 text-sm font-semibold text-white aria-disabled:cursor-not-allowed aria-disabled:bg-slate-300 aria-disabled:text-slate-700"
        >
          {isBusy ? "Aplicando…" : "Aplicar"}
        </button>
      </div>
      <p
        id={descriptionId}
        className="mt-2 text-xs leading-relaxed text-slate-700"
      >
        {scenario?.description}{" "}
        <span className="text-slate-600">
          A escolha vale para todos que estão vendo o site
          {current && control.expiresAt
            ? ` e volta para "${defaultLabel}" às ${formatTime(control.expiresAt)}.`
            : "."}
        </span>
      </p>
      <p role="status" className="mt-1 text-xs font-medium text-slate-900">
        {message}
      </p>
    </div>
  );
}
