import { directionsLink, directionsTarget } from "./directions";
import type { HealthUnit } from "./units";

const linkClass =
  "inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2";

/**
 * Opens a maps app at the unit. The same link on every unit: a way to get
 * there, never a suggestion of which unit to go to.
 */
export function DirectionsLink({ unit }: { unit: HealthUnit }) {
  const target = directionsTarget();
  const isAndroid = target === "android";
  return (
    <a
      href={directionsLink(unit, target)}
      // Android opens the chosen maps app; elsewhere Google Maps opens in a
      // new tab, so the person keeps the page.
      target={isAndroid ? undefined : "_blank"}
      rel="noopener noreferrer"
      className={linkClass}
    >
      Como chegar
      <span className="sr-only">
        : {unit.name},{" "}
        {isAndroid ? "abre o aplicativo de mapas" : "abre o Google Maps em nova aba"}
      </span>
    </a>
  );
}
