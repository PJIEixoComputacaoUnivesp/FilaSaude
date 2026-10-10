import { formatSourceDate, type UnitSource } from "./units";

interface UnitSourcesProps {
  sources: UnitSource[];
  className?: string;
}

function sourceLabel(source: UnitSource): string {
  return source.fields.length === 1 && source.fields[0] === "location"
    ? "Localização"
    : "Cadastro";
}

export function UnitSources({ sources, className = "" }: UnitSourcesProps) {
  return (
    <ul className={className}>
      {sources.map((source) => (
        <li key={`${source.name}-${source.fields.join("-")}`}>
          {sourceLabel(source)}:{" "}
          <a
            className="underline hover:text-fila-blue"
            href={source.url}
            target="_blank"
            rel="noreferrer"
          >
            {source.name}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
          {source.lastUpdatedAt
            ? ` · atualizado em ${formatSourceDate(source.lastUpdatedAt)}`
            : " · atualização não informada pela fonte"}
        </li>
      ))}
    </ul>
  );
}
