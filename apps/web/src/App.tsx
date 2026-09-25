import { useState } from "react";
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

  return (
    <header className="relative z-[1000] border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-12">
        <Link to="/" aria-label="FilaSaúde — página inicial">
          <Logo className="h-10 w-auto" />
        </Link>

        <button
          type="button"
          className="rounded-lg p-2 text-slate-700 md:hidden"
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
          className={`${isMenuOpen ? "flex" : "hidden"} absolute left-0 right-0 top-full flex-col gap-1 border-b border-slate-200 bg-white px-6 py-3 shadow-lg md:static md:flex md:flex-row md:gap-8 md:border-0 md:p-0 md:shadow-none`}
        >
          {navigation.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                onClick={() => setIsMenuOpen(false)}
                className={`rounded-md px-2 py-2 font-medium transition-colors ${active ? "text-fila-blue underline decoration-2 underline-offset-8" : "text-slate-600 hover:text-fila-blue"}`}
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
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 md:grid-cols-[1.05fr_0.95fr] md:px-12 md:py-24">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-fila-green">
            Dados públicos de saúde
          </p>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-fila-blue md:text-6xl">
            Consulte unidades públicas de pronto atendimento.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Endereços, horários informados e localização de unidades em todo o
            Brasil, com dados publicados pelo CNES.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/units"
              className="rounded-xl bg-fila-blue px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              Ver unidades
            </Link>
            <Link
              to="/map"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 transition hover:border-fila-blue hover:text-fila-blue"
            >
              Abrir mapa
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 to-cyan-500 p-8 text-white shadow-xl md:p-10">
          <div className="rounded-2xl border border-white/25 bg-white/10 p-6 backdrop-blur-sm">
            <svg
              className="mb-8 h-16 w-16"
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
            <h2 className="text-2xl font-bold">Informação com procedência</h2>
            <p className="mt-3 leading-relaxed text-blue-50">
              Cada unidade apresenta a fonte pública e a data de atualização
              disponível no cadastro oficial.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-amber-200 bg-amber-50">
        <div className="mx-auto max-w-7xl px-6 py-5 text-sm leading-relaxed text-amber-950 md:px-12">
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
