import { useEffect, useMemo, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { HealthUnit } from "./units";
import {
  formatAddress,
  formatReferenceMonth,
  formatSourceDate,
} from "./units";

const brazilCenter: [number, number] = [-14.2, -51.9];
// Canvas does not resolve CSS variables, so the brand blue is repeated here.
const markerColor = "#1266cc";
const fitPadding = 24;
const preciseMarker = {
  color: "white",
  fillColor: markerColor,
  fillOpacity: 0.8,
  opacity: 1,
  weight: 2,
};
// A hollow ring tells the position is only the municipality center. A
// `history` point keeps the solid marker: it is still a CNES coordinate
// registered for the unit's own address, and the popup says where it is from.
const approximateMarker = {
  color: markerColor,
  fillColor: "white",
  fillOpacity: 0.6,
  opacity: 1,
  weight: 2,
};

type BoundaryGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
interface BoundaryFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: BoundaryGeometry;
}
const boundaryOptions: L.PolylineOptions = { smoothFactor: 0 };

const BRAZIL_BOUNDS: LatLngBoundsExpression = [
  [-34, -74],
  [6, -34],
];

/**
 * Carrega o GeoJSON do Brasil:
 * 1. Aplica uma máscara com #d6e4f0 em todas as regiões fora do Brasil.
 * 2. Renderiza o contorno (borda) do Brasil, mantendo visíveis os detalhes
 *    do OpenStreetMap (cidades, ruas, estados) dentro do território nacional.
 */
function BrazilBorderLayer() {
  const map = useMap();

  useEffect(() => {
    let group: L.LayerGroup | null = null;
    const controller = new AbortController();

    fetch("/brazil.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load Brazil boundary");
        return response.json() as Promise<BoundaryFeature>;
      })
      .then((geojson) => {
        if (controller.signal.aborted) return;
        const worldOuterRing = [
          [-180, -90],
          [-180, 90],
          [180, 90],
          [180, -90],
          [-180, -90],
        ];
        const holes =
          geojson.geometry.type === "MultiPolygon"
            ? geojson.geometry.coordinates.map((polygon) => polygon[0])
            : [geojson.geometry.coordinates[0]];

        const maskGeoJson: BoundaryFeature = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [worldOuterRing, ...holes],
          },
        };

        const maskLayer = L.geoJSON(maskGeoJson, {
          style: {
            ...boundaryOptions,
            fillColor: "#d6e4f0",
            fillOpacity: 1,
            stroke: false,
          },
          interactive: false,
        });

        const borderLayer = L.geoJSON(geojson, {
          style: {
            ...boundaryOptions,
            fill: false,
            color: "#1d4ed8",
            weight: 2,
            opacity: 0.85,
          },
          interactive: false,
        });

        group = L.layerGroup([maskLayer, borderLayer]).addTo(map);
      })
      .catch(() => {
        /* silencioso — o mapa funciona sem a camada do Brasil */
      });

    return () => {
      controller.abort();
      group?.remove();
    };
  }, [map]);

  return null;
}

interface UnitsMapProps {
  units: HealthUnit[];
  className?: string;
  /** When true, the map fits Brazil; otherwise fits the current unit set. */
  isCountryWide?: boolean;
  /** Element drawn over the map; fitted units are kept out from under it. */
  overlayRef?: RefObject<HTMLElement | null>;
}

/** Map padding that keeps fitted points clear of an overlay panel. */
function overlayPadding(
  map: L.Map,
  overlay: HTMLElement | null | undefined,
): L.FitBoundsOptions {
  const padding: L.FitBoundsOptions = {
    padding: [fitPadding, fitPadding],
    maxZoom: 13,
  };
  if (!overlay) return padding;

  const mapBox = map.getContainer().getBoundingClientRect();
  const box = overlay.getBoundingClientRect();
  // A panel spanning most of the width sits on top (narrow screens);
  // otherwise it is a sidebar on the left.
  const topLeft: [number, number] =
    box.width > mapBox.width * 0.6
      ? [fitPadding, box.bottom - mapBox.top + fitPadding]
      : [box.right - mapBox.left + fitPadding, fitPadding];

  return {
    paddingTopLeft: topLeft,
    paddingBottomRight: [fitPadding, fitPadding],
    maxZoom: 13,
  };
}

function FitUnits({
  units,
  overlayRef,
}: {
  units: HealthUnit[];
  overlayRef?: RefObject<HTMLElement | null>;
}) {
  const map = useMap();

  useEffect(() => {
    const coordinates = units
      .filter(
        (unit) =>
          unit.location.latitude !== null && unit.location.longitude !== null,
      )
      .map(
        (unit) =>
          [unit.location.latitude!, unit.location.longitude!] as [
            number,
            number,
          ],
      );

    map.invalidateSize();
    if (coordinates.length > 0) {
      map.fitBounds(coordinates, overlayPadding(map, overlayRef?.current));
    } else {
      map.setView(brazilCenter, 4);
    }
  }, [map, overlayRef, units]);

  return null;
}

function EnforceCountryZoom() {
  const map = useMap();

  useEffect(() => {
    const updateMinZoom = () => {
      map.invalidateSize();
      const boundsZoom = map.getBoundsZoom(BRAZIL_BOUNDS, false);
      map.setMinZoom(boundsZoom);
      if (map.getZoom() < boundsZoom) {
        map.setZoom(boundsZoom);
      }
    };

    updateMinZoom();
    window.addEventListener("resize", updateMinZoom);
    return () => window.removeEventListener("resize", updateMinZoom);
  }, [map]);

  return null;
}

export function UnitsMap({ units, className = "", overlayRef, isCountryWide }: UnitsMapProps) {
  const unitsWithLocation = units.filter(
    (unit) =>
      unit.location.latitude !== null && unit.location.longitude !== null,
  );
  const markerRadius = unitsWithLocation.length > 100 ? 4 : 6;
  // Canvas draws hundreds of markers cheaply, and the tolerance widens each
  // marker's hit area so small points remain easy to tap.
  const renderer = useMemo(() => L.canvas({ tolerance: 10 }), []);

  return (
    <MapContainer
      center={brazilCenter}
      zoom={4}
      maxBounds={BRAZIL_BOUNDS}
      maxBoundsViscosity={1.0}
      className={`h-full w-full ${className}`}
      scrollWheelZoom
      zoomControl={false}
      renderer={renderer}
      style={{ background: "#d6e4f0" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        noWrap

      />
      <BrazilBorderLayer />
      <EnforceCountryZoom />
      <ZoomControl position="bottomleft" />
      <FitUnits units={isCountryWide ? [] : unitsWithLocation} overlayRef={overlayRef} />
      {unitsWithLocation.map((unit) => (
        <CircleMarker
          key={unit.id}
          center={[unit.location.latitude!, unit.location.longitude!]}
          radius={markerRadius}
          pathOptions={
            unit.location.precision === "municipality"
              ? approximateMarker
              : preciseMarker
          }
        >
          <Popup>
            <div className="min-w-48 max-w-[16rem]">
              <strong className="text-sm text-slate-900">{unit.name}</strong>
              <p className="my-2 text-sm text-slate-600">
                {formatAddress(unit.address)}
              </p>
              {unit.serviceHours && (
                <p className="my-2 text-sm text-slate-600">
                  {unit.serviceHours}
                </p>
              )}
              {unit.location.precision === "manual" &&
                unit.location.correctedAt && (
                  <p className="my-2 text-xs font-medium text-amber-800">
                    Posição corrigida manualmente em{" "}
                    {formatSourceDate(unit.location.correctedAt)}.
                  </p>
                )}
              {unit.location.precision === "history" &&
                unit.location.referenceMonth && (
                  <p className="my-2 text-xs font-medium text-amber-800">
                    Posição registrada no CNES em{" "}
                    {formatReferenceMonth(unit.location.referenceMonth)}. A
                    coordenada atual do cadastro está ausente ou fora do
                    município, então mostramos o ponto mais recente dentro do
                    município informado para este mesmo endereço.
                  </p>
                )}
              {unit.location.precision === "municipality" && (
                <p className="my-2 text-xs font-medium text-amber-800">
                  Localização aproximada: centro do município (contorno do
                  IBGE). O cadastro do CNES não traz uma posição válida para
                  esta unidade.
                </p>
              )}
              <p className="mb-0 text-xs text-slate-500">
                CNES · atualizado em {formatSourceDate(unit.lastUpdatedAt)}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
