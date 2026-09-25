import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AboutPage } from "./AboutPage";
import { Logo } from "./Logo";
import { MapPage } from "./MapPage";
import { UnitsPage } from "./UnitsPage";

const navigation = [
  { to: "/", label: "Início" },
  { to: "/units", label: "Unidades" },
  { to: "/map", label: "Mapa" },
  { to: "/about", label: "Sobre" },
];

function Header() {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      // The menu is hidden on close, so focus inside it would fall to <body>.
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  return (
    <header className="relative z-[1000] border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 md:px-12 md:py-4">
        <Link to="/" aria-label="FilaSaúde — página inicial">
          <Logo className="h-10 w-auto" />
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="main-navigation"
          aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            {isMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18 18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>

        <nav
          id="main-navigation"
          aria-label="Navegação principal"
          className={`${isMenuOpen ? "flex" : "hidden"} absolute left-0 right-0 top-full flex-col gap-1 border-b border-slate-200 bg-white px-4 py-3 shadow-lg sm:px-6 md:static md:flex md:flex-row md:gap-8 md:border-0 md:p-0 md:shadow-none`}
        >
          {navigation.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                onClick={() => setIsMenuOpen(false)}
                className={`flex min-h-11 items-center rounded-md px-2 font-medium transition-colors md:min-h-0 md:py-2 ${active ? "text-fila-blue underline decoration-2 underline-offset-8" : "text-slate-600 hover:text-fila-blue"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function HomePage() {
  return (
    <main>
      <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-12 md:px-12 md:py-24">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-fila-green">
            Dados públicos de saúde
          </p>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-fila-blue sm:text-4xl md:text-6xl">
            Consulte unidades públicas de pronto atendimento.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:mt-6 sm:text-lg">
            Endereços, horários informados e localização de unidades em todo o
            Brasil, com dados publicados pelo CNES.
          </p>
          <div className="mt-6 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap">
            <Link
              to="/units"
              className="rounded-xl bg-fila-blue px-6 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              Ver unidades
            </Link>
            <Link
              to="/map"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-center font-semibold text-slate-800 transition hover:border-fila-blue hover:text-fila-blue"
            >
              Abrir mapa
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 to-cyan-500 p-4 text-white shadow-xl sm:p-8 md:p-10">
          <div className="flex items-start gap-4 rounded-2xl border border-white/25 bg-white/10 p-5 backdrop-blur-sm sm:block sm:p-6">
            <svg
              className="h-10 w-10 shrink-0 sm:mb-8 sm:h-16 sm:w-16"
              viewBox="0 0 64 64"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M32 58S52 40.7 52 24A20 20 0 1 0 12 24c0 16.7 20 34 20 34Z"
                fill="white"
                fillOpacity=".18"
                stroke="white"
                strokeWidth="3"
              />
              <path
                d="M32 16v16M24 24h16"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">
                Informação com procedência
              </h2>
              <p className="mt-2 leading-relaxed text-blue-50 sm:mt-3">
                Cada unidade apresenta a fonte pública e a data de atualização
                disponível no cadastro oficial.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-amber-200 bg-amber-50">
        <div className="mx-auto max-w-7xl px-4 py-5 text-sm leading-relaxed text-amber-950 sm:px-6 md:px-12">
          <strong>Importante:</strong> o FilaSaúde não realiza diagnóstico,
          triagem ou recomendação médica. Em uma emergência, procure os canais
          oficiais de atendimento.
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-dvh flex-col bg-fila-bg font-sans">
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/units" element={<UnitsPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
