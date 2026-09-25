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
import type { HealthUnit } from "./units";
import { formatAddress, formatSourceDate } from "./units";

const brazilCenter: [number, number] = [-14.2, -51.9];
// Canvas does not resolve CSS variables, so the brand blue is repeated here.
const markerColor = "#1266cc";
const fitPadding = 24;

interface UnitsMapProps {
  units: HealthUnit[];
  className?: string;
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

export function UnitsMap({
  units,
  className = "",
  overlayRef,
}: UnitsMapProps) {
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
      className={`h-full w-full ${className}`}
      scrollWheelZoom
      zoomControl={false}
      renderer={renderer}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomleft" />
      <FitUnits units={unitsWithLocation} overlayRef={overlayRef} />
      {unitsWithLocation.map((unit) => (
        <CircleMarker
          key={unit.id}
          center={[unit.location.latitude!, unit.location.longitude!]}
          radius={markerRadius}
          pathOptions={{
            color: "white",
            fillColor: markerColor,
            fillOpacity: 0.8,
            opacity: 1,
            weight: 2,
          }}
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
