import { brazilianStates } from "./brazilianStates";

interface BrazilianStateSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Smaller control for overlays; options start with the state abbreviation. */
  compact?: boolean;
}

export function BrazilianStateSelect({
  value,
  onChange,
  compact = false,
}: BrazilianStateSelectProps) {
  return (
    <label className="block">
      <span
        className={`block font-semibold text-slate-800 ${compact ? "mb-1 text-xs sm:mb-2 sm:text-sm" : "mb-2 text-sm"}`}
      >
        Estado
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full border border-slate-300 bg-white text-slate-900 outline-none transition focus:border-fila-blue focus:ring-2 focus:ring-blue-100 ${compact ? "min-h-11 rounded-lg px-2 py-2 sm:px-3" : "rounded-xl px-4 py-3 shadow-sm"}`}
      >
        {brazilianStates.map((state) => (
          <option key={state.abbreviation} value={state.abbreviation}>
            {compact
              ? `${state.abbreviation} · ${state.name}`
              : `${state.name} (${state.abbreviation})`}
          </option>
        ))}
      </select>
    </label>
  );
}
