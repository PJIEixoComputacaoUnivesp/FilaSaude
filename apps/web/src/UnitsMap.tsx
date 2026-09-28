import { useEffect } from "react";
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
import { formatAddress, formatSourceDate } from "./units";

const brazilCenter: [number, number] = [-14.2, -51.9];
const markerColor = "#1266cc";

const BRAZIL_BOUNDS: LatLngBoundsExpression = [
  [-34, -74],
  [6, -34],
];

interface UnitsMapProps {
  units: HealthUnit[];
  className?: string;
  isCountryWide?: boolean;
}

function FitUnits({
  units,
  isCountryWide = false,
}: {
  units: HealthUnit[];
  isCountryWide?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();

    if (isCountryWide) {
      map.fitBounds(BRAZIL_BOUNDS, { padding: [16, 16], animate: true });
      return;
    }

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

    if (coordinates.length > 0) {
      map.fitBounds(coordinates, {
        padding: [32, 32],
        maxZoom: 13,
        animate: true,
      });
    }
  }, [map, units, isCountryWide]);

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

export function UnitsMap({
  units,
  className = "",
  isCountryWide = false,
}: UnitsMapProps) {
  const unitsWithLocation = units.filter(
    (unit) =>
      unit.location.latitude !== null && unit.location.longitude !== null,
  );
  const markerRadius =
    unitsWithLocation.length > 500 ? 3 : unitsWithLocation.length > 50 ? 4 : 6;

  return (
    <MapContainer
      center={brazilCenter}
      zoom={4}
      maxBounds={BRAZIL_BOUNDS}
      maxBoundsViscosity={1.0}
      className={`h-full w-full ${className}`}
      scrollWheelZoom
      zoomControl={false}
      preferCanvas={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        noWrap
      />
      <EnforceCountryZoom />
      <ZoomControl position="bottomleft" />
      <FitUnits units={unitsWithLocation} isCountryWide={isCountryWide} />
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
            <div className="min-w-52">
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
