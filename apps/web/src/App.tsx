import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Logo } from './Logo';

// Red pin setting to show the location on the map
const filaSaudeIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<svg class="w-10 h-10 text-red-600 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

const position: [number, number] = [-23.5505, -46.6333];

// ==========================================
// Page Under Construction
// Pagina mantida para evitar erros nas paginas Unidades e Sobre que estão em desenvolvimento
// ==========================================
function UnderConstruction({ titulo }: { titulo: string }) {
  return (
    <main className="max-w-7xl mx-auto px-6 py-24 text-center flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl md:text-4xl font-bold text-fila-blue">{titulo}</h1>
      <p className="text-gray-600 text-lg max-w-md">
        Esta funcionalidade está sendo desenvolvida para a próxima etapa do projeto.
      </p>
    </main>
  );
}
const UnitsPage = () => <UnderConstruction titulo="Unidades de Saúde" />;
const AboutPage = () => <UnderConstruction titulo="Sobre o FilaSaúde" />;

function Header() {
  const location = useLocation();
  
  // Function to check if the current page is the one linked to be painted blue
  const isActive = (path: string) => location.pathname === path;
  const linkBase = "pb-1 transition-colors";
  const linkActive = "border-b-2 border-fila-blue text-fila-blue";
  const linkInactive = "hover:text-fila-blue text-gray-600";

  return (
    <header className="flex justify-between items-center px-6 py-4 bg-white shadow-sm md:px-12 relative z-50">
      <Logo className="h-10 w-auto" />

      <nav className="hidden md:flex gap-8 font-medium">
        <Link to="/" className={`${linkBase} ${isActive('/') ? linkActive : linkInactive}`}>Home</Link>
        <Link to="/units" className={`${linkBase} ${isActive('/units') ? linkActive : linkInactive}`}>Units</Link>
        <Link to="/map" className={`${linkBase} ${isActive('/map') ? linkActive : linkInactive}`}>Map</Link>
        <Link to="/about" className={`${linkBase} ${isActive('/about') ? linkActive : linkInactive}`}>About</Link>
      </nav>

      <button className="md:hidden text-gray-600">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </header>
  );
}

// ==========================================
// HOME PAGE
// ==========================================
function HomePage() {
  return (
    <main className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
      {/* Left Column: Texts, Search and Notice */}
      <div className="flex flex-col gap-6 relative z-10">
        <h1 className="text-4xl md:text-5xl font-bold text-fila-blue leading-tight">
          Encontre o melhor atendimento público para você.
        </h1>
        <p className="text-gray-600 text-lg max-w-md">
          Informações de unidades de saúde, tempo médio de espera e medicamentos disponíveis em um só lugar.
        </p>
        
        {/* Search Bar */}
        <div className="flex w-full max-w-md bg-white rounded-full shadow-md overflow-hidden p-1 border border-gray-100 mt-2">
          <input type="text" aria-label="Buscar cidade, unidade de saúde ou serviço..." placeholder="Buscar cidade, unidade ou serviço..." className="w-full px-5 py-3 outline-none text-gray-700 bg-transparent placeholder-gray-400" />
          <button type="button" aria-label="Executar busca por unidades de saúde"className="bg-fila-green text-white p-4 rounded-full hover:opacity-90 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>

        {/* Important Notice */}
        <div className="w-full max-w-md bg-amber-50 border-l-4 border-orange-500 p-4 mt-2">
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong className="text-gray-900">Importante:</strong> o FilaSaúde não realiza diagnóstico, triagem ou recomendação médica. Em uma emergência, procure os canais oficiais de atendimento.
          </p>
        </div>
      </div>

      {/* Smaller Map */}
      <div className="relative h-[450px] w-full rounded-2xl overflow-hidden shadow-inner flex items-center justify-center bg-gray-100">
        <MapContainer center={position} zoom={13} scrollWheelZoom={false} className="w-full h-full z-0" dragging={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={position} icon={filaSaudeIcon} />
        </MapContainer>

        <div className="absolute bottom-6 right-6 bg-white shadow-xl rounded-xl p-5 w-64 border border-gray-100 z-10">
          <h3 className="font-bold text-gray-800 text-lg">UPA Central</h3>
          <p className="text-sm text-gray-500 mb-5">Clínica Geral • Pediatria</p>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Tempo médio de espera</p>
          <p className="font-bold text-fila-blue text-3xl mb-3">35 min</p>
          <div className="flex items-center justify-between text-[10px] text-gray-400 border-t border-gray-100 pt-2 mt-2">
            <span>*Dados simulados (Protótipo)</span>
            <span>Atualizado hoje</span>
          </div>
          <svg className="w-full h-10 text-fila-cyan drop-shadow-sm" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M0 25 L 15 20 L 30 25 L 45 10 L 60 15 L 80 5 L 100 8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </main>
  );
}

// ==========================================
// MAPA PAGE
// ==========================================
function MapPage() {
  return (
    <div className="relative w-full h-[calc(100vh-76px)]">
      {/* Floating search bar over the map simulating the same style as Google Maps */}
      <div className="absolute top-6 left-6 z-10 w-80 bg-white rounded-lg shadow-lg p-2 flex">
        <input 
          type="text" 
          placeholder="Pesquisar unidade no mapa..." 
          className="w-full px-3 py-2 outline-none text-gray-700 bg-transparent"
        />
        <button className="text-fila-blue p-2">
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </button>
      </div>

      <MapContainer center={position} zoom={14} className="w-full h-full z-0">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={position} icon={filaSaudeIcon} />
      </MapContainer>
    </div>
  );
}

// ==========================================
// SCREEN ROUTING
// ==========================================
export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-fila-bg font-sans flex flex-col">
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/units" element={<UnitsPage />} />
          <Route path="/Map" element={<MapPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
function App() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-8 sm:py-24 lg:py-36">
      <section className="max-w-3xl" aria-labelledby="page-title">
        <span className="text-brand-700 text-sm font-bold tracking-widest uppercase">
          Informação pública de saúde
        </span>
        <h1
          id="page-title"
          className="text-ink mt-2 mb-4 text-6xl leading-none font-bold tracking-[-0.055em] sm:text-8xl"
        >
          FilaSaúde
        </h1>
        <p className="text-copy max-w-2xl text-lg leading-relaxed sm:text-2xl">
          Encontre informações públicas sobre unidades de pronto atendimento de
          forma simples, acessível e transparente.
        </p>
        <p
          className="border-brand-200 bg-brand-50 text-ink mt-8 inline-block rounded-full border px-4 py-3 font-semibold"
          role="status"
        >
          Estamos preparando a primeira versão da plataforma.
        </p>
      </section>

      <aside
        className="border-caution-600 bg-caution-50 text-ink mt-16 max-w-3xl rounded-sm border-l-4 p-5 leading-relaxed sm:mt-24"
        aria-label="Aviso importante"
      >
        <strong>Importante:</strong> o FilaSaúde não realiza diagnóstico,
        triagem ou recomendação médica. Em uma emergência, procure os canais
        oficiais de atendimento.
      </aside>
    </main>
  )
}

export default App
