function App() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-8 sm:py-24 lg:py-36">
      <section className="max-w-3xl" aria-labelledby="page-title">
        <span className="text-sm font-bold tracking-widest text-emerald-700 uppercase">
          Informação pública de saúde
        </span>
        <h1
          id="page-title"
          className="mt-2 mb-4 text-6xl leading-none font-bold tracking-[-0.055em] text-slate-900 sm:text-8xl"
        >
          FilaSaúde
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-2xl">
          Encontre informações públicas sobre unidades de pronto atendimento de
          forma simples, acessível e transparente.
        </p>
        <p
          className="mt-8 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3 font-semibold text-slate-900"
          role="status"
        >
          Estamos preparando a primeira versão da plataforma.
        </p>
      </section>

      <aside
        className="mt-16 max-w-3xl rounded-sm border-l-4 border-amber-600 bg-amber-50 p-5 leading-relaxed text-slate-900 sm:mt-24"
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
