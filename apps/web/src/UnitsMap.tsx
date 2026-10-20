import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import {
  CircleMarker,
  Circle,
  Marker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { MapFocusRing } from "./MapFocusRing";
import type { UserPosition } from "./useUserLocation";
import { useUnitDistance } from "./useUnitDistance";
import { OccupancyBadge } from "./OccupancyBadge";
import {
  occupancyStatus,
  STATUS_COLORS,
  type UnitOccupancy,
} from "./occupancy";
import { UnitSources } from "./UnitSources";
import { unitListLink } from "./unitLinks";
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
// `dashArray` is set explicitly: setStyle only overwrites the keys it gets,
// so a marker that was "stale" (dashed) would stay dashed after the layer
// is turned off.
const preciseMarker = {
  color: "white",
  fillColor: markerColor,
  fillOpacity: 0.8,
  opacity: 1,
  weight: 2,
  dashArray: undefined,
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
  dashArray: undefined,
};
const noOccupancy: ReadonlyMap<string, UnitOccupancy> = new Map();

/**
 * With the layer on, a unit of the simulation takes the color of its status
 * (see STATUS_COLORS); a stale one is a dashed gray ring. Its text is in the
 * popup and in the list, so the color is never the only cue.
 */
function occupancyMarker(occupancy: UnitOccupancy): L.PathOptions {
  const status = occupancyStatus(occupancy);
  const { fill, stroke, hollow } = STATUS_COLORS[status];
  return {
    color: stroke,
    fillColor: fill,
    fillOpacity: hollow ? 0.85 : 0.95,
    opacity: 1,
    weight: hollow ? 3 : 2.5,
    dashArray: status === "stale" ? "4 3" : undefined,
  };
}

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
function boundaryAttribution({
  source,
  boundaryYear,
}: BoundaryResponse["metadata"]) {
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
  userPosition?: UserPosition;
  locationPanelRef?: RefObject<HTMLElement | null>;
  /** Changes when the person changes the filters (see FitUnits). */
  filterKey?: string;
  /** Whether the position is where the filtered units are (see MapPage). */
  isPositionInArea?: boolean;
  units: HealthUnit[];
  className?: string;
  selectedUnitId?: string;
  listSearch?: string;
  /** When true, the map fits Brazil; otherwise fits the current unit set. */
  isCountryWide?: boolean;
  /** Element drawn over the map; fitted units are kept out from under it. */
  overlayRef?: RefObject<HTMLElement | null>;
  /** Simulated occupancy by CNES; empty while the layer is off. */
  occupancy?: ReadonlyMap<string, UnitOccupancy>;
}

function UnitMarker({
  unit,
  occupancy,
  radius,
  renderer,
  selected,
  overlayRef,
  listSearch,
  autoPanPaddingTopLeft,
  popupMaxWidth,
  popupMaxHeight,
}: {
  unit: HealthUnit;
  occupancy?: UnitOccupancy;
  radius: number;
  renderer: L.Renderer;
  selected: boolean;
  overlayRef?: RefObject<HTMLElement | null>;
  listSearch: string;
  autoPanPaddingTopLeft: [number, number];
  popupMaxWidth: number;
  popupMaxHeight: number;
}) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker>(null);
  const popupHeadingRef = useRef<HTMLElement>(null);
  const isSimulated = occupancy !== undefined;

  // Canvas paints in the order layers were added; a unit of the simulation is
  // brought to the front, so a neutral marker never covers it.
  useEffect(() => {
    if (isSimulated) markerRef.current?.bringToFront();
  }, [isSimulated]);

  useEffect(() => {
    if (!selected || !markerRef.current) return;

    const marker = markerRef.current;
    let opened = false;
    let stopSettling: number | undefined;
    const keepSelectedPopupVisible = () => {
      window.requestAnimationFrame(() =>
        keepPopupClearOfOverlay(map, marker.getPopup(), overlayRef?.current),
      );
    };
    const openPopup = () => {
      if (opened) return;
      opened = true;
      marker.openPopup();
      keepSelectedPopupVisible();
      // Other map effects can finish just after the popup opens. Follow only
      // that initial settling period; later drags remain under user control.
      map.on("moveend", keepSelectedPopupVisible);
      stopSettling = window.setTimeout(() => {
        map.off("moveend", keepSelectedPopupVisible);
      }, 500);
    };
    map.once("moveend", openPopup);
    map.fitBounds([[unit.location.latitude!, unit.location.longitude!]], {
      ...overlayPadding(map, overlayRef?.current),
      maxZoom: 15,
      animate: map.options.zoomAnimation !== false,
    });
    // With motion disabled Leaflet can finish before the event listener is
    // observed by React, so this also opens the popup on the next frame.
    if (map.options.zoomAnimation === false) {
      window.requestAnimationFrame(openPopup);
    }

    return () => {
      if (stopSettling !== undefined) window.clearTimeout(stopSettling);
      map.off("moveend", openPopup);
      map.off("moveend", keepSelectedPopupVisible);
    };
  }, [map, overlayRef, selected, unit]);

  return (
    <CircleMarker
      ref={markerRef}
      center={[unit.location.latitude!, unit.location.longitude!]}
      // A little larger, so the few units of the simulation are easy to find.
      radius={occupancy ? radius + 3 : radius}
      renderer={renderer}
      eventHandlers={{
        popupopen: () => {
          window.requestAnimationFrame(() => {
            keepPopupClearOfOverlay(
              map,
              markerRef.current?.getPopup(),
              overlayRef?.current,
            );
            if (selected) popupHeadingRef.current?.focus();
          });
        },
      }}
      pathOptions={
        occupancy
          ? occupancyMarker(occupancy)
          : unit.location.precision === "municipality"
            ? approximateMarker
            : preciseMarker
      }
    >
      <Popup
        autoPanPaddingTopLeft={autoPanPaddingTopLeft}
        autoPanPaddingBottomRight={[fitPadding, fitPadding]}
        maxWidth={popupMaxWidth}
      >
        <div
          className="min-w-48 max-w-full overflow-y-auto pr-1"
          style={{ maxHeight: popupMaxHeight }}
        >
          <strong
            ref={popupHeadingRef}
            tabIndex={selected ? -1 : undefined}
            className="text-sm text-slate-900 focus:outline-none"
          >
            {unit.name}
          </strong>
          <p className="my-2 text-sm text-slate-600">
            {formatAddress(unit.address)}
          </p>
          <PopupDistance unit={unit} />
          {unit.serviceHours && (
            <p className="my-2 text-sm text-slate-600">{unit.serviceHours}</p>
          )}
          {occupancy && (
            <OccupancyBadge occupancy={occupancy} className="my-2" />
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
                coordenada atual do cadastro está ausente ou fora do município,
                então mostramos o ponto mais recente dentro do município
                informado para este mesmo endereço.
              </p>
            )}
          {unit.location.precision === "municipality" && (
            <p className="my-2 text-xs font-medium text-amber-800">
              Localização aproximada: centro do município (contorno do IBGE). O
              cadastro do CNES não traz uma posição válida para esta unidade.
            </p>
          )}
          <UnitSources
            sources={unit.sources}
            className="mb-0 space-y-1 text-xs text-slate-500"
          />
          <Link
            to={unitListLink(unit.id, listSearch)}
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
          >
            Ver na lista
            <span className="sr-only">: {unit.name}</span>
          </Link>
        </div>
      </Popup>
    </CircleMarker>
  );
}

/**
 * Its own component: only an open popup reads the person's position, so a
 * new reading does not redraw every marker.
 */
function PopupDistance({ unit }: { unit: HealthUnit }) {
  const distance = useUnitDistance(unit);
  return distance ? (
    <p className="my-2 text-sm text-slate-600">Distância de você: {distance}</p>
  ) : null;
}

function UnitMarkers({
  units,
  occupancy,
  radius,
  renderer,
  selectedUnitId,
  overlayRef,
  listSearch,
}: {
  units: HealthUnit[];
  occupancy: ReadonlyMap<string, UnitOccupancy>;
  radius: number;
  renderer: L.Renderer;
  selectedUnitId?: string;
  overlayRef?: RefObject<HTMLElement | null>;
  listSearch: string;
}) {
  const map = useMap();
  const [layout, setLayout] = useState<{
    autoPanPaddingTopLeft: [number, number];
    popupMaxWidth: number;
    popupMaxHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    const updateLayout = () => {
      const popupMaxWidth = Math.max(
        192,
        Math.min(256, map.getSize().x - fitPadding * 2 - 72),
      );
      const mapBox = map.getContainer().getBoundingClientRect();
      const autoPanPaddingTopLeft = popupAutoPanPadding(
        map,
        overlayRef?.current,
      );
      // Leaflet adds about 28px of vertical chrome around popup content.
      const popupMaxHeight = Math.max(
        128,
        Math.min(
          448,
          mapBox.height - autoPanPaddingTopLeft[1] - fitPadding - 28,
        ),
      );
      // This state mirrors the current DOM geometry of the responsive panel.
      // oxlint-disable-next-line react/set-state-in-effect
      setLayout({
        autoPanPaddingTopLeft,
        popupMaxWidth,
        popupMaxHeight,
      });
    };
    updateLayout();
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(map.getContainer());
    if (overlayRef?.current) resizeObserver.observe(overlayRef.current);
    window.addEventListener("resize", updateLayout);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [map, overlayRef]);

  if (layout === null) return null;

  return units.map((unit) => (
    <UnitMarker
      key={unit.id}
      unit={unit}
      occupancy={occupancy.get(unit.id)}
      radius={radius}
      renderer={renderer}
      selected={unit.id === selectedUnitId}
      overlayRef={overlayRef}
      listSearch={listSearch}
      autoPanPaddingTopLeft={layout.autoPanPaddingTopLeft}
      popupMaxWidth={layout.popupMaxWidth}
      popupMaxHeight={layout.popupMaxHeight}
    />
  ));
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

/** Keeps an opened popup clear of the search panel and viewport edges. */
function popupAutoPanPadding(
  map: L.Map,
  overlay: HTMLElement | null | undefined,
): [number, number] {
  if (!overlay) return [fitPadding, fitPadding];

  const mapBox = map.getContainer().getBoundingClientRect();
  const box = overlay.getBoundingClientRect();
  return box.width > mapBox.width * 0.6
    ? [fitPadding, box.bottom - mapBox.top + fitPadding]
    : [box.right - mapBox.left + fitPadding, fitPadding];
}

/** Leaflet's automatic pan does not account reliably for an HTML overlay. */
function keepPopupClearOfOverlay(
  map: L.Map,
  popup: L.Popup | undefined,
  overlay: HTMLElement | null | undefined,
): void {
  if (!popup?.isOpen()) return;
  const element = popup?.getElement();
  if (!element) return;

  const mapBox = map.getContainer().getBoundingClientRect();
  const popupBox = element.getBoundingClientRect();
  const [leftPadding, topPadding] = popupAutoPanPadding(map, overlay);
  const safe = {
    left: mapBox.left + leftPadding,
    top: mapBox.top + topPadding,
    right: mapBox.right - fitPadding,
    bottom: mapBox.bottom - fitPadding,
  };
  const moveX =
    popupBox.left < safe.left
      ? safe.left - popupBox.left
      : popupBox.right > safe.right
        ? safe.right - popupBox.right
        : 0;
  const moveY =
    popupBox.top < safe.top
      ? safe.top - popupBox.top
      : popupBox.bottom > safe.bottom
        ? safe.bottom - popupBox.bottom
        : 0;

  if (moveX !== 0 || moveY !== 0) {
    map.panBy([-moveX, -moveY], { animate: false });
  }
}

function FitUnits({
  units,
  overlayRef,
  hasSelection,
  framesUserPosition,
  filterKey,
}: {
  units: HealthUnit[];
  overlayRef?: RefObject<HTMLElement | null>;
  /** A selected unit frames the map itself (see UnitMarker). */
  hasSelection: boolean;
  /** The person's position is known and inside the filtered area. */
  framesUserPosition: boolean;
  /** Changes when the person changes the filters (UF, text, simulated). */
  filterKey: string;
}) {
  const map = useMap();
  // The filters in place when the person's position framed the map. Late
  // catalog responses and overlay resizing must not undo that view; a filter
  // the person changes afterwards frames its units again, for good.
  const positionFilterKey = useRef<string | null>(null);

  useEffect(() => {
    if (!framesUserPosition) positionFilterKey.current = null;
    else if (positionFilterKey.current === null) {
      positionFilterKey.current = filterKey;
    }
    if (framesUserPosition && positionFilterKey.current === filterKey) return;
    if (framesUserPosition) positionFilterKey.current = "";
    const coordinates = units
      .filter(hasLocation)
      .map(
        (unit) =>
          [unit.location.latitude!, unit.location.longitude!] as [
            number,
            number,
          ],
      );

    // Only turn animation off (reduced motion, chosen when the map was
    // created). Leaflet decides otherwise; passing `true` would force an
    // animated zoom even from a far-away view, which it skips by default.
    const noMotion: L.ZoomPanOptions =
      map.options.zoomAnimation === false ? { animate: false } : {};
    let fitted: { center: L.LatLng; zoom: number } | null = null;
    const remember = () => {
      fitted = { center: map.getCenter(), zoom: map.getZoom() };
    };
    const fit = () => {
      map.invalidateSize();
      map.once("moveend", remember);
      if (coordinates.length > 0) {
        map.fitBounds(coordinates, {
          ...overlayPadding(map, overlayRef?.current),
          ...noMotion,
        });
      } else {
        map.setView(brazilCenter, 4, noMotion);
      }
    };
    fit();

    // The panel grows when the occupancy layer or its legend opens. While the
    // view is still the one fitted here, fit again, so the points stay out
    // from under the panel; once the person moves the map, leave it.
    const overlay = overlayRef?.current;
    if (!overlay || coordinates.length === 0 || hasSelection) {
      return () => map.off("moveend", remember);
    }
    let height = overlay.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      const next = overlay.getBoundingClientRect().height;
      if (next === height) return;
      height = next;
      const untouched =
        fitted !== null &&
        fitted.zoom === map.getZoom() &&
        fitted.center.equals(map.getCenter(), 1e-6);
      if (untouched) fit();
    });
    observer.observe(overlay);
    return () => {
      observer.disconnect();
      map.off("moveend", remember);
    };
  }, [map, overlayRef, units, hasSelection, framesUserPosition, filterKey]);

  return null;
}

// A cyan dot with a white and a dark ring distinguishes the person's position
// from the unit discs by size and shape, not only by color, and keeps 3:1 on
// any tile. Values as in index.css (canvas paths do not read CSS variables).
const userLocationColor = "#00a5e3";
const userLocationIcon = L.divIcon({
  className: "user-location-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function UserLocation({
  position,
  overlayRef,
  locationPanelRef,
  hasSelection,
  frame,
}: {
  position: UserPosition;
  /** False when the person is outside the filtered area: only drawn. */
  frame: boolean;
  /** A selected unit keeps the view; the position is only drawn. */
  hasSelection: boolean;
  overlayRef?: RefObject<HTMLElement | null>;
  locationPanelRef?: RefObject<HTMLElement | null>;
}) {
  const map = useMap();
  const { latitude, longitude, accuracy } = position;
  // A more precise reading arriving after a deliberate map move only moves
  // the target; it does not take the view back.
  const following = useRef(!hasSelection);
  useEffect(() => {
    if (!frame || !following.current) return;
    map.closePopup();
    const bounds = L.latLng(latitude, longitude).toBounds(
      Math.max(accuracy * 2, 100),
    );
    let isFitting = false;
    const fit = () => {
      const mapBox = map.getContainer().getBoundingClientRect();
      const locationBox = locationPanelRef?.current?.getBoundingClientRect();
      const padding = overlayPadding(map, overlayRef?.current);
      const { x: left, y: top } = L.point(
        padding.paddingTopLeft ?? padding.padding ?? [fitPadding, fitPadding],
      );
      isFitting = true;
      try {
        map.fitBounds(bounds, {
          ...padding,
          // Short landscape screens can scroll because the map has a minimum
          // height. Keep the position inside the visible part of that map too.
          paddingTopLeft: [left, Math.max(top, fitPadding - mapBox.top)],
          paddingBottomRight: [
            fitPadding,
            Math.max(
              locationBox
                ? mapBox.bottom - locationBox.top + fitPadding
                : fitPadding,
              mapBox.bottom - window.innerHeight + fitPadding,
            ),
          ],
          maxZoom: 16,
          animate: false,
        });
      } finally {
        isFitting = false;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    if (overlayRef?.current) observer.observe(overlayRef.current);
    if (locationPanelRef?.current) observer.observe(locationPanelRef.current);
    // After a deliberate map move, resizing should preserve that view.
    map.on("movestart", stopFollowing);
    function stopFollowing() {
      if (isFitting) return;
      following.current = false;
      observer.disconnect();
      map.off("movestart", stopFollowing);
    }
    return () => {
      observer.disconnect();
      map.off("movestart", stopFollowing);
    };
  }, [
    map,
    latitude,
    longitude,
    accuracy,
    overlayRef,
    locationPanelRef,
    frame,
  ]);

  return (
    <>
      <Circle
        center={[latitude, longitude]}
        radius={accuracy}
        pathOptions={{
          color: userLocationColor,
          fillOpacity: 0.1,
          weight: 1,
          interactive: false,
        }}
      />
      <Marker
        position={[latitude, longitude]}
        icon={userLocationIcon}
        title="Sua localização aproximada"
        alt="Sua localização aproximada"
        keyboard={false}
        interactive={false}
        zIndexOffset={1000}
      />
    </>
  );
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

export function UnitsMap({
  userPosition,
  locationPanelRef,
  filterKey = "",
  isPositionInArea = true,
  units,
  className = "",
  overlayRef,
  isCountryWide,
  selectedUnitId,
  listSearch = "",
  occupancy = noOccupancy,
}: UnitsMapProps) {
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
      <FitUnits
        framesUserPosition={userPosition !== undefined && isPositionInArea}
        filterKey={filterKey}
        units={unitsToFit}
        overlayRef={overlayRef}
        hasSelection={selectedUnitId !== undefined}
      />
      <UnitMarkers
        units={unitsWithLocation}
        occupancy={occupancy}
        radius={markerRadius}
        renderer={renderer}
        selectedUnitId={selectedUnitId}
        overlayRef={overlayRef}
        listSearch={listSearch}
      />
      {userPosition && (
        <UserLocation
          position={userPosition}
          overlayRef={overlayRef}
          locationPanelRef={locationPanelRef}
          hasSelection={selectedUnitId !== undefined}
          frame={isPositionInArea}
        />
      )}
    </MapContainer>
  );
}
