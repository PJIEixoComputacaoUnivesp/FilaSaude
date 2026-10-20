import { useId, useRef } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AboutPage } from "./AboutPage";
import { AdminPage } from "./AdminPage";
import { Logo } from "./Logo";
import { MapPage } from "./MapPage";
import { OccupancyLayerProvider } from "./OccupancyLayerProvider";
import { SearchFiltersProvider } from "./SearchFiltersProvider";
import { UserLocationProvider } from "./UserLocationProvider";
import { UnitDetailPage } from "./UnitDetailPage";
import { UnitsPage } from "./UnitsPage";
import { useSearchFilters } from "./useSearchFilters";

// The map is the entry point and the list is its accessible equivalent. They
// are two views of the same search, so they share the query string (see
// useSearchFilters) when the user switches between them.
const views = [
  { to: "/", label: "Mapa" },
  { to: "/units", label: "Lista" },
];

function Header() {
  const { search } = useSearchFilters();

  return (
    <header className="relative z-[1000] border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6 md:py-3">
        <Link
          to="/"
          aria-label="FilaSaúde — página inicial"
          className="inline-flex min-h-11 items-center"
        >
          <Logo className="h-8 w-auto sm:h-9" />
        </Link>

        <nav aria-label="Forma de visualização">
          <ul className="flex gap-1">
            {views.map((view) => (
              <li key={view.to}>
                <NavLink
                  to={{ pathname: view.to, search }}
                  end
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center rounded-lg px-3 font-semibold sm:px-4 ${isActive ? "text-fila-blue underline decoration-2 underline-offset-8" : "text-slate-700 hover:bg-slate-100"}`
                  }
                >
                  {view.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** Sends old and unknown paths to the map without losing the search. */
function RedirectToMap() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/", search }} replace />;
}

const linkClass =
  "whitespace-nowrap font-semibold text-fila-blue underline underline-offset-2";

const safetyNotice = (
  <>
    <strong className="font-semibold text-slate-900">Informativo:</strong> não
    faz diagnóstico, triagem nem recomendação médica. Em emergência, procure os
    canais oficiais de atendimento.
  </>
);

// On phones the full notice took two lines below the map. A short line stays
// visible and the full text opens in a native popover (Escape, tapping
// outside and moving focus away close it), so it never depends on hover.
function Footer() {
  const noticeId = useId();
  const noticeRef = useRef<HTMLDivElement>(null);
  const footerNoticeRef = useRef<HTMLDivElement>(null);

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div
        ref={footerNoticeRef}
        onBlur={(event) => {
          // A tap on the card's text moves focus nowhere (no relatedTarget);
          // the popover closes itself on taps outside.
          const next = event.relatedTarget;
          if (next && !footerNoticeRef.current?.contains(next)) {
            noticeRef.current?.hidePopover();
          }
        }}
        className="flex items-center justify-between gap-1 px-4 sm:hidden"
      >
        <p className="min-w-0 text-xs text-slate-700">
          <strong className="font-semibold text-slate-900">Informativo:</strong>{" "}
          sem orientação médica
        </p>
        {/* The ring is drawn inside: the button touches the bottom of the
            viewport and the map above it. */}
        <button
          type="button"
          popoverTarget={noticeId}
          className="-mr-2 min-h-11 shrink-0 px-2 text-xs font-semibold text-fila-blue underline underline-offset-2 focus-visible:-outline-offset-3"
        >
          Saiba mais
          <span className="sr-only"> sobre o aviso informativo</span>
        </button>
        <div
          ref={noticeRef}
          id={noticeId}
          popover="auto"
          role="note"
          aria-label="Aviso informativo"
          className="fixed inset-x-4 bottom-14 top-auto mx-auto my-0 max-h-[calc(100dvh-5rem)] w-auto max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 backdrop:bg-transparent"
        >
          <p>{safetyNotice}</p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <Link
              to="/about"
              onClick={() => noticeRef.current?.hidePopover()}
              className={`inline-flex min-h-11 items-center ${linkClass}`}
            >
              Sobre os dados
            </Link>
            <button
              type="button"
              popoverTarget={noticeId}
              popoverTargetAction="hide"
              className="min-h-11 rounded-lg px-3 font-semibold text-fila-blue"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
      <p className="mx-auto hidden max-w-7xl px-6 py-2 text-xs leading-relaxed text-slate-700 sm:block md:py-3 md:text-sm">
        {safetyNotice}{" "}
        <Link to="/about" className={linkClass}>
          Sobre os dados
        </Link>
      </p>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SearchFiltersProvider>
        <OccupancyLayerProvider>
          <UserLocationProvider>
            <div className="relative flex min-h-dvh flex-col bg-fila-bg font-sans">
              <a
                href="#conteudo"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[1100] focus:rounded-lg focus:border focus:border-slate-300 focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-fila-blue"
              >
                Ir para o conteúdo
              </a>
              <Header />
              <main
                id="conteudo"
                tabIndex={-1}
                className="flex flex-1 flex-col focus:outline-none"
              >
                <Routes>
                  <Route path="/" element={<MapPage />} />
                  <Route path="/units" element={<UnitsPage />} />
                  <Route path="/units/:unitId" element={<UnitDetailPage />} />
                  <Route path="/map" element={<RedirectToMap />} />
                  <Route path="/about" element={<AboutPage />} />
                  {/* Not in the navigation: only the team is meant to find it. */}
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="*" element={<RedirectToMap />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </UserLocationProvider>
        </OccupancyLayerProvider>
      </SearchFiltersProvider>
    </BrowserRouter>
  );
}
