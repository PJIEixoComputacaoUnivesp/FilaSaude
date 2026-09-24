import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { HealthUnit } from "./units";
import { formatAddress, formatSourceDate } from "./units";

const saoPaulo: [number, number] = [-23.5505, -46.6333];

const unitIcon = L.divIcon({
  className: "unit-map-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  popupAnchor: [0, -34],
});

interface UnitsMapProps {
  units: HealthUnit[];
  className?: string;
}

export function UnitsMap({ units, className = "" }: UnitsMapProps) {
  const unitsWithLocation = units.filter(
    (unit) =>
      unit.location.latitude !== null && unit.location.longitude !== null,
  );

  return (
    <MapContainer
      center={saoPaulo}
      zoom={11}
      className={`h-full w-full ${className}`}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {unitsWithLocation.map((unit) => (
        <Marker
          key={unit.id}
          position={[unit.location.latitude!, unit.location.longitude!]}
          icon={unitIcon}
          alt={unit.name}
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
        </Marker>
      ))}
    </MapContainer>
  );
}
