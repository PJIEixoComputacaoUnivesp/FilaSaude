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
import { UnitsPage } from "./UnitsPage";

// The map is the entry point and the list is its accessible equivalent. They
// are two views of the same search, so they share the query string (see
// useSearchFilters) when the user switches between them.
const views = [
  { to: "/", label: "Mapa" },
  { to: "/units", label: "Lista" },
];

function Header() {
  const { search } = useLocation();

  return (
    <header className="relative z-[1000] border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6 md:py-3">
        <Link to="/" aria-label="FilaSaúde — página inicial">
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

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-2 text-xs leading-relaxed text-slate-700 sm:px-6 md:items-center md:gap-8 md:py-3 md:text-sm">
        <p>
          <strong className="font-semibold text-slate-900">Importante:</strong>{" "}
          o FilaSaúde não realiza diagnóstico, triagem ou recomendação médica.
          Em uma emergência, procure os canais oficiais de atendimento.
        </p>
        {/* The negative margin keeps the footer compact while the link keeps a
            44px touch target. */}
        <Link
          to="/about"
          className="-my-2.5 inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-fila-blue underline underline-offset-2 md:my-0"
        >
          Sobre os dados
        </Link>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
            <Route path="/map" element={<RedirectToMap />} />
            <Route path="/about" element={<AboutPage />} />
            {/* Not in the navigation: only the team is meant to find it. */}
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<RedirectToMap />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
