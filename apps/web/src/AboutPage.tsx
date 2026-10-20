import { OCCUPANCY_EXPLANATION, SIMULATION_NOTICE } from "./occupancy";
import { Link } from "react-router-dom";
import { usePageHeading } from "./usePageHeading";
import { useSearchFilters } from "./useSearchFilters";

const title = "Sobre os dados";

export function AboutPage() {
  const headingRef = usePageHeading(title);
  const { search } = useSearchFilters();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6 md:gap-10 md:py-10">
      <div className="flex flex-col gap-3">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold leading-tight tracking-tight text-fila-blue focus:outline-none sm:text-3xl"
        >
          {title}
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
          Os dados vêm do Cadastro Nacional de Estabelecimentos de Saúde (CNES).
          Cada unidade mostra a fonte e a data da última atualização registrada
          no cadastro oficial.
        </p>
        <p className="text-base leading-relaxed text-slate-700">
          Quando a consulta direta ao CNES não é usada, exibimos uma cópia de
          segurança. Nesse caso, um aviso indica até que data ela está
          atualizada. Endereço e horário podem ter mudado desde então.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sobre-leitos">
        <h2 id="sobre-leitos" className="text-xl font-bold text-slate-900">
          O que significa a ocupação simulada de leitos
        </h2>
        <p className="text-base leading-relaxed text-slate-700">
          Quando disponível, essa camada apresenta uma demonstração acadêmica.
          As capacidades e quantidades ocupadas são geradas pelo simulador; não
          vêm do cadastro de leitos de cada unidade. {SIMULATION_NOTICE}
        </p>
        <p className="text-base leading-relaxed text-slate-700">
          {OCCUPANCY_EXPLANATION} O detalhe mostra os valores por categoria. As
          faixas de cor são convenções da simulação.
        </p>
        <p className="text-base leading-relaxed text-slate-700">
          Esta entrega não informa pessoas em espera, pessoas em atendimento ou
          atendimentos concluídos.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sobre-localizacao">
        <h2 id="sobre-localizacao" className="text-xl font-bold text-slate-900">
          Sua localização no mapa
        </h2>
        <p className="text-base leading-relaxed text-slate-700">
          Ao entrar no FilaSaúde, o navegador pede sua permissão para obter uma
          posição aproximada por GPS ou outras fontes do dispositivo. Se você
          recusar, o mapa continua mostrando o Brasil; se depois permitir nas
          configurações do navegador, sua posição aparece sem recarregar a
          página. Primeiro aparece uma posição rápida, que é ajustada quando
          chega uma leitura mais precisa. Um ponto com anel indica sua posição
          e o círculo mostra a precisão informada pelo navegador. A posição
          fica apenas na memória desta aba, pode ser removida e não é enviada à
          API do FilaSaúde nem incluída na URL.
        </p>
        <p className="text-base leading-relaxed text-slate-700">
          O mapa carrega imagens do OpenStreetMap conforme a área visualizada.
          A localização exige conexão segura e pode falhar ou ser imprecisa.
          Você pode continuar consultando por cidade ou unidade.
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
          to={{ pathname: "/", search }}
          className="inline-flex min-h-11 items-center font-semibold text-fila-blue underline underline-offset-2"
        >
          Voltar ao mapa
        </Link>
      </p>
    </div>
  );
}
