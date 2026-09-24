import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { HealthUnit } from "./units";
import { formatAddress, formatSourceDate } from "./units";

const brazilCenter: [number, number] = [-14.2, -51.9];

interface UnitsMapProps {
  units: HealthUnit[];
  className?: string;
}

function FitUnits({ units }: { units: HealthUnit[] }) {
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
      map.fitBounds(coordinates, { padding: [32, 32], maxZoom: 13 });
    } else {
      map.setView(brazilCenter, 4);
    }
  }, [map, units]);

  return null;
}

export function UnitsMap({ units, className = "" }: UnitsMapProps) {
  const unitsWithLocation = units.filter(
    (unit) =>
      unit.location.latitude !== null && unit.location.longitude !== null,
  );

  return (
    <MapContainer
      center={brazilCenter}
      zoom={4}
      className={`h-full w-full ${className}`}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitUnits units={unitsWithLocation} />
      {unitsWithLocation.map((unit) => (
        <CircleMarker
          key={unit.id}
          center={[unit.location.latitude!, unit.location.longitude!]}
          radius={6}
          pathOptions={{
            color: "white",
            fillColor: "var(--color-fila-blue)",
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
