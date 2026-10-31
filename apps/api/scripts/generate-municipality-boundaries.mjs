import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Writes the simplified IBGE boundaries of every municipality, grouped by state
// and keyed by the 6-digit code CNES uses. The API validates unit coordinates
// against this file because the IBGE host may be unreachable from the server.
// Usage: node apps/api/scripts/generate-municipality-boundaries.mjs
const meshesUrl = "https://servicodados.ibge.gov.br/api/v3/malhas/estados";
const states = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];
// The national mesh had 5,570 municipalities when this script was written.
const minimumMunicipalities = 5_500;

function isPosition(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function isPolygon(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition))
  );
}

function polygonsOf({ type, coordinates }) {
  if (type === "Polygon" && isPolygon(coordinates)) return [coordinates];
  if (
    type === "MultiPolygon" &&
    Array.isArray(coordinates) &&
    coordinates.length > 0 &&
    coordinates.every(isPolygon)
  ) {
    return coordinates;
  }
  throw new Error("IBGE returned an invalid boundary");
}

async function boundariesOf(state) {
  const url = new URL(`${meshesUrl}/${state}`);
  url.search = new URLSearchParams({
    intrarregiao: "municipio",
    formato: "application/vnd.geo+json",
    qualidade: "minima",
  }).toString();

  const response = await fetch(url, {
    headers: { Accept: "application/vnd.geo+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`IBGE returned ${response.status} for ${state}`);

  const { features } = await response.json();
  if (!Array.isArray(features) || features.length === 0) {
    throw new Error(`IBGE returned no boundaries for ${state}`);
  }
  return Object.fromEntries(
    features.map(({ properties, geometry }) => [
      properties.codarea.slice(0, 6),
      polygonsOf(geometry),
    ]),
  );
}

const boundaries = {};
for (const state of states) boundaries[state] = await boundariesOf(state);

const total = Object.values(boundaries).reduce(
  (sum, municipalities) => sum + Object.keys(municipalities).length,
  0,
);
if (total < minimumMunicipalities) {
  throw new Error(`Expected at least ${minimumMunicipalities} municipalities, got ${total}`);
}

writeFileSync(
  fileURLToPath(new URL("../src/units/municipality-boundaries.json", import.meta.url)),
  `${JSON.stringify({
    source: "IBGE, malhas territoriais (API v3, qualidade mínima)",
    sourceUrl: meshesUrl,
    retrievedAt: new Date().toISOString().slice(0, 10),
    boundaries,
  })}\n`,
);
console.log(`Wrote ${total} municipalities of ${states.length} states`);
