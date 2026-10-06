import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Input: BR_Pais_2025.shp from the IBGE country boundary download.
// Keep every polygon (including islands); simplify with at most ~11 m error.
const tolerance = 0.0001;
const source = readFileSync(process.argv[2]);
if (source.readInt32BE(0) !== 9994 || source.readInt32LE(32) !== 5) {
  throw new Error("Expected an ESRI Polygon shapefile");
}

function simplify(points) {
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let maximum = tolerance * tolerance;
    let selected = -1;
    for (let index = first + 1; index < last; index++) {
      const [x, y] = points[index];
      const t = lengthSquared
        ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared))
        : 0;
      const distance = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (distance > maximum) {
        maximum = distance;
        selected = index;
      }
    }
    if (selected !== -1) {
      keep.add(selected);
      pending.push([first, selected], [selected, last]);
    }
  }
  const result = [...keep].sort((a, b) => a - b).map((index) => points[index]);
  return result.length >= 4 ? result : points;
}

const polygons = [];
for (let record = 100; record < source.length;) {
  const size = source.readInt32BE(record + 4) * 2;
  const start = record + 8;
  if (source.readInt32LE(start) !== 5) throw new Error("Unexpected shape type");
  const partCount = source.readInt32LE(start + 36);
  const pointCount = source.readInt32LE(start + 40);
  const pointOffset = start + 44 + partCount * 4;
  for (let part = 0; part < partCount; part++) {
    const first = source.readInt32LE(start + 44 + part * 4);
    const last = part + 1 < partCount
      ? source.readInt32LE(start + 44 + (part + 1) * 4)
      : pointCount;
    const ring = [];
    for (let index = first; index < last; index++) {
      ring.push([0, 8].map((offset) =>
        Number(source.readDoubleLE(pointOffset + index * 16 + offset).toFixed(6))));
    }
    // ESRI exterior rings are clockwise; GeoJSON exterior rings are CCW.
    const area = ring.slice(1).reduce((sum, point, index) =>
      sum + ring[index][0] * point[1] - point[0] * ring[index][1], 0);
    const simplified = simplify(ring).reverse();
    if (area < 0) polygons.push([simplified]);
    else {
      if (!polygons.length) throw new Error("Interior ring without exterior");
      polygons[polygons.length - 1].push(simplified);
    }
  }
  record += 8 + size;
}

const feature = {
  type: "Feature",
  properties: {
    name: "Brasil",
    source: "IBGE — Malha Municipal 2025, BR_Pais_2025",
    sourceUrl: "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/Brasil/BR_Pais_2025.zip",
    boundaryYear: 2025,
    simplificationToleranceDegrees: tolerance,
  },
  geometry: { type: "MultiPolygon", coordinates: polygons },
};
writeFileSync(fileURLToPath(new URL("../public/brazil.geojson", import.meta.url)), JSON.stringify(feature) + "\n");
console.log(`${polygons.length} polygons, ${polygons.flat(2).length} points`);
