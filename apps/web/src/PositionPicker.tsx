import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Coordinate } from "./admin";

const brazilCenter: [number, number] = [-14.2, -51.9];
const unitZoom = 16;
// Canvas does not resolve CSS variables, so the colors are repeated here.
const currentMarker = {
  color: "white",
  fillColor: "#1266cc",
  fillOpacity: 0.9,
  opacity: 1,
  weight: 2,
};
const proposedMarker = {
  color: "#047857",
  fillColor: "#10b981",
  fillOpacity: 0.3,
  opacity: 1,
  weight: 4,
};

function ClickToPick({ onPick }: { onPick: (position: Coordinate) => void }) {
  useMapEvents({
    click: (event) =>
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  });
  return null;
}

/** Brings a position typed or pasted into the fields into view. */
function ShowProposed({ proposed }: { proposed: Coordinate | null }) {
  const map = useMap();
  useEffect(() => {
    if (!proposed) return;
    const point: [number, number] = [proposed.latitude, proposed.longitude];
    // A click is already inside the view, so only a far jump moves the map.
    if (!map.getBounds().contains(point)) map.panTo(point);
  }, [map, proposed]);
  return null;
}

/**
 * Moves the view to a unit when another one is chosen. The map stays mounted:
 * recreating it on every change dropped focus and reloaded the tiles.
 */
function RecenterOnUnit({
  focusKey,
  center,
}: {
  focusKey: string | null;
  center: Coordinate | null;
}) {
  const map = useMap();
  const latest = useRef(center);
  useEffect(() => {
    latest.current = center;
  });
  useEffect(() => {
    const target = latest.current;
    if (focusKey && target) {
      map.setView([target.latitude, target.longitude], unitZoom);
    }
  }, [map, focusKey]);
  return null;
}

function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
      <li className="flex items-center gap-2">
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="#1266cc" stroke="white" strokeWidth="2" />
        </svg>
        Posição mostrada hoje
      </li>
      <li className="flex items-center gap-2">
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="#10b981"
            fillOpacity="0.3"
            stroke="#047857"
            strokeWidth="3"
          />
        </svg>
        Posição proposta
      </li>
    </ul>
  );
}

/**
 * A map to mark the correct position by clicking it, next to the fields that
 * hold the same values. Clicking on a map is not possible by keyboard, so the
 * fields remain the way to do everything the map does.
 */
export function PositionPicker({
  current,
  proposed,
  focusKey,
  onPick,
}: {
  /** The position the public sees today, when the unit is known. */
  current: Coordinate | null;
  /** The position the form holds, when both fields are valid numbers. */
  proposed: Coordinate | null;
  /** Changes when another unit is chosen, which recenters the map. */
  focusKey: string | null;
  onPick: (position: Coordinate) => void;
}) {
  const start = current ?? proposed;

  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">Marcar no mapa</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Clique no mapa para marcar a posição correta. Os campos de latitude e
        longitude são preenchidos. Pelo teclado, digite os valores nos campos.
      </p>
      <div
        role="region"
        aria-label="Mapa para marcar a posição da unidade"
        className="picker-map isolate mt-3 overflow-hidden rounded-xl border border-slate-300"
      >
        <MapContainer
          center={start ? [start.latitude, start.longitude] : brazilCenter}
          zoom={start ? unitZoom : 4}
          // Capped by the screen height: a map that fills it leaves no room to scroll
          // the page, since dragging on the map moves the map.
          className="h-[min(18rem,55dvh)] w-full sm:h-[min(24rem,60dvh)]"
          scrollWheelZoom
          zoomControl={false}
          style={{ background: "#d6e4f0", cursor: "crosshair" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ZoomControl position="bottomleft" />
          <RecenterOnUnit focusKey={focusKey} center={current} />
          <ClickToPick onPick={onPick} />
          <ShowProposed proposed={proposed} />
          {current && (
            <CircleMarker
              center={[current.latitude, current.longitude]}
              radius={8}
              pathOptions={currentMarker}
              interactive={false}
            />
          )}
          {proposed && (
            <CircleMarker
              center={[proposed.latitude, proposed.longitude]}
              radius={11}
              pathOptions={proposedMarker}
              interactive={false}
            />
          )}
        </MapContainer>
      </div>
      <Legend />
    </div>
  );
}
