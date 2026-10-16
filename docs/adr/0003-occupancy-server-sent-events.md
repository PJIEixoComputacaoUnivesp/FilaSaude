# ADR 0003: Atualização da ocupação de leitos por SSE

- Status: aceita
- Data: 2026-10-16
- PR: [#104](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/pull/104)
- Issues: [#78](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/78), [#79](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/79)
- Dependência: carga nacional da [PR #105](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/pull/105)

## Contexto

O simulador envia eventos nacionais continuamente, independentemente da
localização, dos filtros ou da presença de visitantes. A API recebe snapshots
assinados, persiste a inbox e projeta o estado atual de cada unidade no
PostgreSQL. O histórico preserva os eventos processados dentro da retenção.

O mapa, a lista e o detalhe precisam refletir essas alterações automaticamente.
Repetir a consulta nacional por polling transfere novamente unidades que não
mudaram para cada navegador e vincula a percepção de atualização ao intervalo
de consulta. Encurtar esse intervalo aumenta consultas e tráfego.

A comunicação necessária é da API para o navegador. O visitante não controla
o simulador nem envia comandos pelo canal de atualização. Nesta entrega, os
dados são exclusivamente ocupação simulada de leitos; o transporte não define
novas métricas nem altera o significado das cores.

## Decisão

Usar Server-Sent Events (SSE) para transmitir alterações parciais e manter
REST para obter o estado inicial e sincronizar novamente após reconexões.

1. O navegador consulta `GET /occupancy` e mantém uma conexão
   `GET /occupancy/stream` enquanto a camada está ativa e a página visível.
   As mensagens `occupancy.updated` incluem apenas as unidades afetadas.
2. O processador usa `pg_notify` na mesma transação do processamento. A
   notificação se torna visível após o commit e contém somente o CNES.
   Os valores enviados ao navegador são consultados do estado persistido.
3. Cada instância da API mantém um listener PostgreSQL compartilhado por seus
   clientes SSE. Agrupa notificações por 100 ms e consulta somente os CNES
   afetados. Sem assinantes, não consulta deltas para transmissão.
4. A interface combina deltas por CNES e respeita a ordenação por
   `occurredAt`, `observedAt`, `receivedAt` e `eventId`. Eventos recebidos
   durante a sincronização inicial são acumulados para evitar perda ou
   substituição de um estado mais recente por um mais antigo.
5. Uma abertura ou reabertura do EventSource provoca sincronização por REST.
   Uma reconexão do listener PostgreSQL também solicita ressincronização aos
   clientes. Heartbeats mantêm atividade no canal; o proxy desativa buffering.
6. O detalhe consulta novamente o histórico quando seu CNES recebe um evento,
   inclusive um evento atrasado que não modifica o estado atual. A expiração
   visual de dados sem confirmação usa o relógio local, sem polling de rede.

SSE transporta o estado de apresentação. PostgreSQL continua como fonte dos
dados persistidos. `LISTEN/NOTIFY` sinaliza alterações e não substitui a inbox
ou o histórico.

## Alternativas consideradas

- **Polling periódico:** implementação simples, mas repetiria respostas
  nacionais completas por visitante mesmo sem mudanças. Não foi escolhido
  como mecanismo de atualização automática nem como fallback silencioso.
- **WebSocket:** permitiria comunicação bidirecional, que este fluxo não
  exige. SSE atende ao envio de alterações por uma conexão HTTP e usa o
  EventSource do navegador, incluindo sua reconexão.
- **Broker dedicado:** adicionaria um serviço para distribuir notificações.
  A inbox persistida e o mecanismo de notificação do PostgreSQL atendem à
  entrega atual. Um broker pode ser reconsiderado se a escala ou os requisitos
  de entrega exigirem outra solução.

## Consequências e limites

- A atualização automática deixa de depender de consultas nacionais
  periódicas. A latência ainda inclui envio do simulador, processamento da
  inbox (2 segundos por padrão), agrupamento e rede; SSE não elimina essas
  etapas nem garante atualização instantânea.
- Cada navegador ativo mantém uma conexão HTTP, e cada instância da API
  reserva uma conexão PostgreSQL para o listener. O dimensionamento deve
  considerar o pool do banco e a quantidade de conexões abertas no proxy.
- Os identificadores SSE não constituem replay durável. Eventos perdidos
  durante uma desconexão são compensados pela leitura do estado atual; não
  existe garantia de que o navegador observará cada transição intermediária.
  O histórico permanece consultável no PostgreSQL dentro da retenção.
- Em interrupções do canal, a interface preserva os dados já recebidos,
  informa a reconexão e mantém a indicação de ausência de confirmação recente.
- Eventos nacionais continuam chegando ao backend quando a camada está
  desligada ou o navegador está fechado. Filtros visuais não controlam a fonte.
- A API continua oferecendo REST para consulta e recuperação. Não é necessário
  manter SSE aberto para consultar uma unidade ou consumir o histórico.

## Validação

Testes cobrem compartilhamento do listener, agrupamento, reconexão,
encerramento, sincronização inicial com eventos concorrentes, ordenação e
atualização do histórico por unidade. O fluxo também foi verificado em
navegador real com a carga nacional, recebendo deltas sem novas consultas
completas após a sincronização inicial.

## Referências

- [Contrato do stream de ocupação](../contracts/occupancy-stream-v1.md)
- [Contrato do snapshot de ocupação](../contracts/occupancy-snapshot-v1.md)
- [Operação e testes do simulador](../simulator-testing.md)
- Implementação: `apps/api/src/occupancy/occupancy-stream.service.ts` e
  `apps/web/src/occupancyStream.ts`.
