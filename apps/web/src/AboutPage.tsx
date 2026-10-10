import { Link } from "react-router-dom";
import { usePageHeading } from "./usePageHeading";

export function AboutPage() {
  const headingRef = usePageHeading("Sobre os dados");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6 md:gap-10 md:py-10">
      <div className="flex flex-col gap-3">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold leading-tight tracking-tight text-fila-blue focus:outline-none sm:text-3xl"
        >
          Sobre os dados
        </h1>
        <p className="text-lg leading-relaxed text-slate-700">
          O FilaSaúde reúne informações cadastrais públicas de unidades de
          pronto atendimento para facilitar a consulta.
        </p>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="sobre-fontes">
        <h2 id="sobre-fontes" className="text-xl font-bold text-slate-900">
          De onde vêm as informações
        </h2>
        <p className="text-base leading-relaxed text-slate-700">
          Os dados vêm do Cadastro Nacional de Estabelecimentos de Saúde
          (CNES). Cada unidade mostra a fonte e a data da última atualização
          registrada no cadastro oficial.
        </p>
        <p className="text-base leading-relaxed text-slate-700">
          Quando a consulta direta ao CNES não é usada, exibimos uma cópia de
          segurança. Nesse caso, um aviso indica até que data ela está
          atualizada. Endereço e horário podem ter mudado desde então.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sobre-limites">
        <h2 id="sobre-limites" className="text-xl font-bold text-slate-900">
          O que o FilaSaúde não faz
        </h2>
        <p className="text-base leading-relaxed text-slate-700">
          Não realizamos diagnóstico, triagem nem recomendação médica, e não
          indicamos qual unidade é a mais adequada para cada caso. A ordem dos
          resultados é alfabética e não indica prioridade. Em uma emergência,
          procure os canais oficiais de atendimento.
        </p>
      </section>

      <p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
        >
          Voltar ao mapa
        </Link>
      </p>
    </div>
  );
}
