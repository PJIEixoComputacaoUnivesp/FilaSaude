import { brazilianStates } from "./brazilianStates";

interface BrazilianStateSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function BrazilianStateSelect({
  value,
  onChange,
}: BrazilianStateSelectProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800">
        Estado
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-fila-blue focus:ring-2 focus:ring-blue-100"
      >
        {brazilianStates.map((state) => (
          <option key={state.abbreviation} value={state.abbreviation}>
            {state.name} ({state.abbreviation})
          </option>
        ))}
      </select>
    </label>
  );
}
