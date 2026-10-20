import { brazilianStates, NationalStateCode } from "./brazilianStates";

interface BrazilianStateSelectProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  allOptionLabel?: string;
  nearbySelected?: boolean;
  canSelectNearby?: boolean;
  onSelectNearby?: () => void;
}

export function BrazilianStateSelect({
  value,
  onChange,
  compact = false,
  allOptionLabel,
  nearbySelected = false,
  canSelectNearby = false,
  onSelectNearby,
}: BrazilianStateSelectProps) {
  return (
    <label className="block">
      <span
        className={`block font-semibold text-slate-800 ${compact ? "sr-only text-xs sm:not-sr-only sm:mb-2 sm:text-sm" : "mb-2 text-sm"}`}
      >
        Estado
      </span>
      <select
        value={nearbySelected ? "NEARBY" : value}
        onChange={(event) => {
          if (event.target.value === "NEARBY") onSelectNearby?.();
          else onChange(event.target.value);
        }}
        className={`min-h-11 w-full border border-slate-300 bg-white text-slate-900 focus-visible:border-fila-blue ${compact ? "rounded-lg px-2 py-2 sm:px-3" : "rounded-xl px-4 py-3"}`}
      >
        {allOptionLabel && (
          <option value={NationalStateCode.All}>{allOptionLabel}</option>
        )}
        {onSelectNearby && (
          <option value="NEARBY" disabled={!canSelectNearby}>
            Ao redor de você
          </option>
        )}
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
