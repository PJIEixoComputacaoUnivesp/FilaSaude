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
