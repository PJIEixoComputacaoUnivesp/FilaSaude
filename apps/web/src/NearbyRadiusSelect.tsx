import { useId } from "react";

interface NearbyRadiusSelectProps {
  radiusKm: number;
  options: number[];
  onChange: (value: number) => void;
  compact?: boolean;
}

export function NearbyRadiusSelect({
  radiusKm,
  options,
  onChange,
  compact = false,
}: NearbyRadiusSelectProps) {
  const id = useId();
  const radii = [...new Set([...options, radiusKm])].sort((a, b) => a - b);

  return (
    <label className="block">
      <span
        className={`block font-semibold text-slate-800 ${compact ? "sr-only text-xs sm:not-sr-only sm:mb-2 sm:text-sm" : "mb-2 text-sm"}`}
      >
        Distância de você
      </span>
      <select
        id={id}
        value={radiusKm}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`min-h-11 w-full border border-slate-300 bg-white text-slate-900 focus-visible:border-fila-blue ${compact ? "rounded-lg px-2 py-2 sm:px-3" : "rounded-xl px-4 py-3"}`}
      >
        {radii.map((radius) => (
          <option key={radius} value={radius}>
            Até {radius} km
          </option>
        ))}
      </select>
    </label>
  );
}
