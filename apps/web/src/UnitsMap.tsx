import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { MapFocusRing } from "./MapFocusRing";
import { UnitSources } from "./UnitSources";
import type { HealthUnit } from "./units";
import {
  formatAddress,
  formatReferenceMonth,
  formatSourceDate,
  hasLocation,
} from "./units";

const brazilCenter: [number, number] = [-14.2, -51.9];
// A fixed empty list, so a country-wide view does not look like a new input.
const noUnits: HealthUnit[] = [];
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
// Private Leaflet members FollowingCanvas relies on (stable across 1.x).
type CanvasInternals = L.Canvas & {
  _bounds?: L.Bounds;
  _map: L.Map;
  _update: () => void;
  _redrawIfUncovered: () => void;
};
// Leaflet redraws a canvas only on moveend, so a drag longer than its padding
// would reveal tiles the mask does not cover yet (a neighbor country, when
// zoomed in near the border). This one also redraws while the map moves, once
// the view leaves the area the canvas covers.
const FollowingCanvas: new (options?: L.RendererOptions) => L.Canvas =
  L.Canvas.extend({
    getEvents(this: CanvasInternals) {
      return {
        ...L.Canvas.prototype.getEvents!.call(this),
        move: this._redrawIfUncovered,
      };
    },
    _redrawIfUncovered(this: CanvasInternals) {
      const map = this._map;
      const view = L.bounds(
        map.containerPointToLayerPoint([0, 0]),
        map.containerPointToLayerPoint(map.getSize()),
      );
      if (!this._bounds || !this._bounds.contains(view)) this._update();
    },
  });
// Leaflet's default simplification (about one pixel at each zoom). Drawing all
// ~144k points of the outline on every redraw is too slow to follow a drag.
const boundaryOptions: L.PolylineOptions = { smoothFactor: 1 };
// Its own pane, above the tiles (200) and below the markers (overlay, 400),
// so the mask canvas never hides a marker or takes its clicks.
const boundaryPane = "brazilBoundary";
const boundaryTimeout = 10_000;

const BRAZIL_BOUNDS: LatLngBoundsExpression = [
  [-34, -74],
  [6, -34],
];
// The outline's own box, oceanic islands included (BRAZIL_BOUNDS stops at
// -34 and would cut Fernando de Noronha and Trindade). Tiles are only
// requested inside it, so the world beyond it is never downloaded.
const TILE_BOUNDS = L.latLngBounds([
  [-33.8, -74],
  [5.3, -28.8],
]);

type BoundaryDetail = "low" | "high";
interface BoundaryResponse {
  data: BoundaryFeature;
  metadata: {
    detail: BoundaryDetail;
    boundaryYear: number;
    source: { name: string; url: string };
  };
}
// The light outline is within about a pixel up to zoom 7 (see the API); from
// here on the map fetches the full one.
const highDetailZoom = 8;

async function fetchBoundary(
  detail: BoundaryDetail,
  signal: AbortSignal,
): Promise<BoundaryResponse> {
  const response = await fetch(`/api/boundaries/brazil?detail=${detail}`, {
    signal,
  });
  if (!response.ok) throw new Error("Unable to load Brazil boundary");
  return (await response.json()) as BoundaryResponse;
}

/**
 * Credit for the outline. Leaflet renders attributions as HTML, so the values
 * from the response are escaped and only an http(s) link is kept.
 */
function boundaryAttribution({ source, boundaryYear }: BoundaryResponse["metadata"]) {
  const escape = (text: string) =>
    text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  const label = `IBGE ${escape(String(boundaryYear))}`;
  return /^https?:\/\//.test(source.url)
    ? `Contorno: <a href="${escape(source.url)}">${label}</a>`
    : `Contorno: ${label}`;
}

/** The world with Brazil cut out, so only the country shows the tiles. */
function maskOf(feature: BoundaryFeature): BoundaryFeature {
  const worldOuterRing = [
    [-180, -90],
    [-180, 90],
    [180, 90],
    [180, -90],
    [-180, -90],
  ];
  const holes =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates.map((polygon) => polygon[0])
      : [feature.geometry.coordinates[0]];
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [worldOuterRing, ...holes] },
  };
}

/**
 * Carrega o contorno do Brasil pela API:
 * 1. Aplica uma máscara com #d6e4f0 em todas as regiões fora do Brasil.
 * 2. Renderiza o contorno (borda) do Brasil, mantendo visíveis os detalhes
 *    do OpenStreetMap (cidades, ruas, estados) dentro do território nacional.
 *
 * O contorno leve chega primeiro e libera a base; o completo é baixado só
 * quando o zoom passa de 7 e substitui o leve.
 */
function BrazilBorderLayer({ onSettled }: { onSettled: () => void }) {
  const map = useMap();

  useEffect(() => {
    const controller = new AbortController();
    if (!map.getPane(boundaryPane)) {
      const pane = map.createPane(boundaryPane);
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
    const renderer = new FollowingCanvas({ pane: boundaryPane }).addTo(map);
    let group: L.LayerGroup | null = null;
    let shownDetail: BoundaryDetail | null = null;
    let isHighRequested = false;

    const show = ({ data, metadata }: BoundaryResponse) => {
      // The full outline is never replaced by the light one.
      if (controller.signal.aborted || shownDetail === "high") return;
      const maskLayer = L.geoJSON(maskOf(data), {
        style: {
          ...boundaryOptions,
          renderer,
          fillColor: "#d6e4f0",
          fillOpacity: 1,
          stroke: false,
        },
        interactive: false,
      });
      const borderLayer = L.geoJSON(data, {
        style: {
          ...boundaryOptions,
          renderer,
          fill: false,
          color: "#1d4ed8",
          weight: 2,
          opacity: 0.85,
        },
        interactive: false,
        attribution: boundaryAttribution(metadata),
      });
      group?.remove();
      group = L.layerGroup([maskLayer, borderLayer]).addTo(map);
      shownDetail = metadata.detail;
    };

    // The tiles wait for the light outline. If it is slow or stalls without
    // failing, the base map shows anyway and the mask comes in when it does.
    const timeout = window.setTimeout(onSettled, boundaryTimeout);
    fetchBoundary("low", controller.signal)
      .then((boundary) => {
        show(boundary);
        onSettled();
      })
      .catch(() => {
        // An unmount (StrictMode included) aborts the fetch; only a real
        // failure lets the base map show without the mask.
        if (controller.signal.aborted) return;
        onSettled();
      })
      .finally(() => window.clearTimeout(timeout));

    // A failure keeps the light outline, which is only a few pixels off.
    const loadHighDetail = () => {
      if (isHighRequested || map.getZoom() < highDetailZoom) return;
      isHighRequested = true;
      fetchBoundary("high", controller.signal)
        .then(show)
        .catch(() => {});
    };
    loadHighDetail();
    map.on("zoomend", loadHighDetail);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      map.off("zoomend", loadHighDetail);
      group?.remove();
      renderer.remove();
    };
  }, [map, onSettled]);

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
      .filter(hasLocation)
      .map(
        (unit) =>
          [unit.location.latitude!, unit.location.longitude!] as [
            number,
            number,
          ],
      );

    map.invalidateSize();
    // Only turn animation off (reduced motion, chosen when the map was
    // created). Leaflet decides otherwise; passing `true` would force an
    // animated zoom even from a far-away view, which it skips by default.
    const noMotion: L.ZoomPanOptions =
      map.options.zoomAnimation === false ? { animate: false } : {};
    if (coordinates.length > 0) {
      map.fitBounds(coordinates, {
        ...overlayPadding(map, overlayRef?.current),
        ...noMotion,
      });
    } else {
      map.setView(brazilCenter, 4, noMotion);
    }
  }, [map, overlayRef, units]);

  return null;
}

/**
 * Canvas markers cannot be reached by keyboard or screen reader, so the map is
 * named as a supplement and points to the list, which has the same data. Also
 * replaces the English strings and the flag that Leaflet adds by default.
 */
function MapLocalization() {
  const map = useMap();

  // Leaflet hard-codes the English "Close popup" name on its close button.
  useMapEvents({
    popupopen(event) {
      event.popup
        .getElement()
        ?.querySelector(".leaflet-popup-close-button")
        ?.setAttribute("aria-label", "Fechar detalhes da unidade");
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute("role", "group");
    container.setAttribute(
      "aria-label",
      "Mapa das unidades. Para consultar por teclado ou leitor de tela, use a lista.",
    );
    // Credit for OpenStreetMap stays in the tile layer attribution; this only
    // drops Leaflet's default prefix (the Ukrainian flag and English title).
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" title="Biblioteca para mapas interativos">Leaflet</a>',
    );
  }, [map]);

  return null;
}

/**
 * A tile on the edge of TILE_BOUNDS still reaches past it (at zoom 4 the row
 * over the north of Brazil goes up to the Caribbean). Each such tile is
 * clipped to the box, so a drag past the mask canvas shows the background
 * color there, not raw tiles. The clip lives on the tile, so it follows drags
 * and zoom animations without any redraw.
 */
function BrazilTileLayer() {
  const map = useMap();
  const clipToBrazil = useCallback(
    ({ tile, coords, target }: L.TileEvent & { target: L.GridLayer }) => {
      const size = target.getTileSize();
      const box = L.bounds(
        map.project(TILE_BOUNDS.getNorthWest(), coords.z),
        map.project(TILE_BOUNDS.getSouthEast(), coords.z),
      );
      const top = Math.max(0, box.min!.y - coords.y * size.y);
      const left = Math.max(0, box.min!.x - coords.x * size.x);
      const bottom = Math.max(0, (coords.y + 1) * size.y - box.max!.y);
      const right = Math.max(0, (coords.x + 1) * size.x - box.max!.x);
      if (top || left || bottom || right) {
        tile.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
      }
    },
    [map],
  );
  const eventHandlers = useMemo(
    () => ({ tileloadstart: clipToBrazil }),
    [clipToBrazil],
  );

  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      bounds={TILE_BOUNDS}
      noWrap
      eventHandlers={eventHandlers}
    />
  );
}

function EnforceCountryZoom() {
  const map = useMap();

  useEffect(() => {
    const updateMinZoom = () => {
      map.invalidateSize();
      const boundsZoom = map.getBoundsZoom(BRAZIL_BOUNDS, false);
      map.setMinZoom(boundsZoom);
      if (map.getZoom() < boundsZoom) {
        // Without animation the zoom applies now, before any tile is asked.
        map.setZoom(boundsZoom, { animate: false });
      }
    };

    updateMinZoom();
    window.addEventListener("resize", updateMinZoom);
    return () => window.removeEventListener("resize", updateMinZoom);
  }, [map]);

  return null;
}

export function UnitsMap({ units, className = "", overlayRef, isCountryWide }: UnitsMapProps) {
  // Stable between renders: FitUnits re-fits the map whenever this changes.
  const unitsWithLocation = useMemo(() => units.filter(hasLocation), [units]);
  const unitsToFit = isCountryWide ? noUnits : unitsWithLocation;
  const markerRadius = unitsWithLocation.length > 100 ? 4 : 6;
  // Canvas draws hundreds of markers cheaply, and the tolerance widens each
  // marker's hit area so small points remain easy to tap.
  const renderer = useMemo(() => L.canvas({ tolerance: 10 }), []);
  // Tiles wait for the mask (or its failure), so the world never shows
  // before it, and for the minimum zoom, so no tile is fetched and dropped.
  const [isBaseReady, setBaseReady] = useState(false);
  // Stable, so the boundary is not fetched again on each render.
  const showBase = useCallback(() => setBaseReady(true), []);
  // Leaflet reads its animation options once, when the map is created.
  const animate = useMemo(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  return (
    <MapContainer
      center={brazilCenter}
      zoom={4}
      maxBounds={BRAZIL_BOUNDS}
      maxBoundsViscosity={1.0}
      className={`h-full w-full ${className}`}
      scrollWheelZoom
      zoomControl={false}
      zoomAnimation={animate}
      fadeAnimation={animate}
      markerZoomAnimation={animate}
      inertia={animate}
      renderer={renderer}
      style={{ background: "#d6e4f0" }}
    >
      {isBaseReady && <BrazilTileLayer />}
      <BrazilBorderLayer onSettled={showBase} />
      <MapLocalization />
      <MapFocusRing />
      <EnforceCountryZoom />
      <ZoomControl
        position="bottomleft"
        zoomInTitle="Aproximar o mapa"
        zoomOutTitle="Afastar o mapa"
      />
      <FitUnits units={unitsToFit} overlayRef={overlayRef} />
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
              <UnitSources
                sources={unit.sources}
                className="mb-0 space-y-1 text-xs text-slate-500"
              />
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
