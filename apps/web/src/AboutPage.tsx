export function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 md:py-24 flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl md:text-5xl font-bold text-fila-blue leading-tight">
          Sobre o FilaSaúde
        </h1>
        <p className="text-gray-600 text-lg leading-relaxed">
          O FilaSaúde é uma plataforma informativa sobre unidades públicas de
          pronto atendimento. Reunimos informações cadastrais públicas em um só
          lugar para facilitar a consulta.
        </p>
      </div>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="sobre-oferecemos"
      >
        <h2 id="sobre-oferecemos" className="text-2xl font-bold text-gray-800">
          O que oferecemos
        </h2>
        <ul className="text-gray-600 text-lg leading-relaxed list-disc pl-5 flex flex-col gap-1">
          <li>
            Localização das unidades de pronto atendimento em um mapa
            interativo.
          </li>
          <li>
            Informações públicas sobre cada unidade, como endereço e horário
            informado.
          </li>
          <li>Busca por estado, cidade, nome da unidade ou bairro.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sobre-fontes">
        <h2 id="sobre-fontes" className="text-2xl font-bold text-gray-800">
          Fontes dos dados
        </h2>
        <p className="text-gray-600 text-lg leading-relaxed">
          As informações exibidas têm origem no Cadastro Nacional de
          Estabelecimentos de Saúde (CNES). Sempre que uma unidade for exibida,
          indicamos a fonte pública e a data da última atualização.
        </p>
      </section>

      <section aria-labelledby="sobre-aviso">
        <h2 id="sobre-aviso" className="sr-only">
          Aviso importante
        </h2>
        <div className="w-full bg-amber-50 border-l-4 border-orange-500 p-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong className="text-gray-900">Importante:</strong> o FilaSaúde
            não realiza diagnóstico, triagem ou recomendação médica, e não
            indica qual unidade é a mais adequada para o seu caso. Em uma
            emergência, procure os canais oficiais de atendimento.
          </p>
        </div>
      </section>
    </main>
  );
}
