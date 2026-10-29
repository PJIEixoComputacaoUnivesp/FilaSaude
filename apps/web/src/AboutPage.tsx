import { COLOR_NOTICE, STATUS_LABELS, STATUS_RANGES } from "./occupancy";
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

      <section
        id="ocupacao-simulada"
        className="flex scroll-mt-20 flex-col gap-3"
        aria-labelledby="sobre-ocupacao"
      >
        <h2 id="sobre-ocupacao" className="text-xl font-bold text-slate-900">
          Ocupação simulada
        </h2>
        <p className="text-base leading-relaxed text-slate-700">
          É uma demonstração acadêmica, ligada pelo botão “Ocupação simulada”.
          Pessoas esperando, pessoas em atendimento, atendimentos concluídos,
          leitos e serviços são gerados por um simulador. Não vêm das unidades e
          não representam a situação real delas.
        </p>
        <h3 className="text-base font-semibold text-slate-900">
          Como ler as cores
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-base leading-relaxed text-slate-700">
          {(["low", "moderate", "high"] as const).map((status) => (
            <li key={status}>
              {STATUS_LABELS[status]}: {STATUS_RANGES[status]}.
            </li>
          ))}
        </ul>
        <p className="text-base leading-relaxed text-slate-700">
          A capacidade é quantas pessoas a unidade atende ao mesmo tempo no
          cenário simulado. Leitos e atendimentos concluídos não mudam a cor.
          Sem dados recentes, a cor deixa de aparecer. {COLOR_NOTICE}
        </p>
        <h3 className="text-base font-semibold text-slate-900">
          Espera estimada
        </h3>
        <p className="text-base leading-relaxed text-slate-700">
          O FilaSaúde divide a fila de agora pelo ritmo com que os atendimentos
          começaram recentemente, usando até uma hora de envios do simulador.
          Com poucos dados, a estimativa fica indisponível. Ela não mede a
          espera de ninguém nem prevê quanto uma pessoa real aguardará; na
          unidade, o atendimento segue critérios clínicos.
        </p>
        <h3 className="text-base font-semibold text-slate-900">Contagens</h3>
        <p className="text-base leading-relaxed text-slate-700">
          Esperando e em atendimento são pessoas no momento do último envio.
          Atendimentos concluídos somam o dia, em horário de Brasília, e contam
          atendimentos, não pessoas. Os serviços listados não confirmam o que a
          unidade oferece de verdade.
        </p>
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="sobre-localizacao"
      >
        <h2 id="sobre-localizacao" className="text-xl font-bold text-slate-900">
          Sua localização no mapa
        </h2>
        <p className="text-base leading-relaxed text-slate-700">
          Ao entrar no FilaSaúde, o navegador pede sua permissão para obter uma
          posição aproximada por GPS ou outras fontes do dispositivo. Se você
          recusar, o mapa continua mostrando o Brasil; se depois permitir nas
          configurações do navegador, sua posição aparece sem recarregar a
          página. Primeiro aparece uma posição rápida, que é ajustada quando
          chega uma leitura mais precisa. Um ponto com anel indica sua posição e
          o círculo mostra a precisão informada pelo navegador. A posição fica
          apenas na memória desta aba, pode ser removida e não é enviada à API
          do FilaSaúde nem incluída na URL.
        </p>
        <p className="text-base leading-relaxed text-slate-700">
          O mapa carrega imagens do OpenStreetMap conforme a área visualizada.
          “Como chegar” abre o aplicativo de mapas do celular (no Android) ou o
          Google Maps com o destino da unidade; a rota parte da posição que o
          próprio aplicativo obtém, e a sua posição no FilaSaúde não é enviada.
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
