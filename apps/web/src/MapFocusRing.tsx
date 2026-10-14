import { useEffect } from "react";
import { useMap } from "react-leaflet";

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
    let isPointerDown = false;
    // Also covers a click on a map that is already focused (no focus event).
    // Focus that later arrives by keyboard clears it in markFocus.
    const press = () => {
      isPointerDown = true;
      container.dataset.pointerFocus = "";
    };
    const release = () => {
      isPointerDown = false;
    };
    const markFocus = () => {
      if (isPointerDown) container.dataset.pointerFocus = "";
      else delete container.dataset.pointerFocus;
    };
    const showRing = () => {
      delete container.dataset.pointerFocus;
    };

    container.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    container.addEventListener("focus", markFocus);
    container.addEventListener("keydown", showRing);
    return () => {
      container.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      container.removeEventListener("focus", markFocus);
      container.removeEventListener("keydown", showRing);
      showRing();
    };
  }, [map]);

  return null;
}
