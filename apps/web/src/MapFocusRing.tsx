import { useEffect } from "react";
import { useMap } from "react-leaflet";

// On touch, the mousedown that focuses the map is emulated after pointerup,
// so a focus this soon after a pointerdown still counts as pointer focus.
const pointerFocusWindow = 1000;
// Held for mouse gestures (Shift+drag zooms to a box), not keyboard use.
const modifierKeys = new Set(["Shift", "Control", "Alt", "Meta"]);

/**
 * Marks the map when it got focus from a pointer, so the focus ring drawn in
 * index.css shows only for keyboard focus. Leaflet focuses the map itself on
 * mousedown, and that focus can still match `:focus-visible`. A key pressed on
 * the map brings the ring back, since the keyboard is then in use.
 */
export function MapFocusRing() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let lastPointerDown = -Infinity;
    // Also covers a click on a map that is already focused (no focus event).
    // Focus that later arrives by keyboard clears it in markFocus.
    const press = () => {
      lastPointerDown = performance.now();
      container.dataset.pointerFocus = "";
    };
    const markFocus = () => {
      if (performance.now() - lastPointerDown < pointerFocusWindow) {
        container.dataset.pointerFocus = "";
      } else {
        delete container.dataset.pointerFocus;
      }
    };
    const showRing = () => {
      delete container.dataset.pointerFocus;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!modifierKeys.has(event.key)) showRing();
    };

    container.addEventListener("pointerdown", press);
    container.addEventListener("focus", markFocus);
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("pointerdown", press);
      container.removeEventListener("focus", markFocus);
      container.removeEventListener("keydown", onKeyDown);
      showRing();
    };
  }, [map]);

  return null;
}
