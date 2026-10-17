# Referência de regras e limites

Esta referência descreve o código atual, não parâmetros verificados em produção.
Veja o [fluxo completo](architecture-flow.md) e o [runbook](operations.md).

## Webhook e envio

| Regra | Comportamento |
| --- | --- |
| Ordem de recebimento | Tipo/tamanho do corpo → autenticação → limite por fonte → JSON/schema → autorização do CNES → duplicidade → persistência |
| Assinatura | HMAC dos bytes exatos; janela de cinco minutos para o timestamp do cabeçalho |
| Limite | 60 requisições por janela de 60 segundos, por fonte e por instância da API, em memória |
| Consumo do limite | Após autenticar, inclusive requisições posteriormente rejeitadas ou duplicadas |
| Duplicidade | Mesmo `eventId`, mesma fonte e mesmo corpo textual: `202`; outra fonte ou corpo: `409` |
| Retenção e duplicidade | A garantia dura enquanto a entrada existir na inbox; após remoção, o identificador pode ser inserido novamente |
| Envio | Três tentativas por padrão; timeout de 10 segundos por tentativa |
| Retentativas | Rede/timeout, `429` e `5xx`; outros `4xx` encerram o envio |
| Espera | Backoff de 1 s, 2 s, limitado a 30 s; `429` usa `Retry-After` inteiro em segundos, sem esse teto (ausente/inválido: 1 s) |

Reiniciar uma API apaga suas janelas de limite. Réplicas não compartilham o
contador. JSON reformatado pode conflitar mesmo com os mesmos valores; a
serialização e o `eventId` são preservados nas retentativas, enquanto timestamp
do cabeçalho e assinatura são renovados. O timestamp de autenticação não é o
`occurredAt` do evento: um snapshot antigo pode chegar autenticado agora.

O runner local encerra diante de falha de envio esgotada. O nacional registra
a falha nas métricas e continua sua agenda; não mantém uma fila durável de
reenvio de eventos esgotados. O estado nacional avança mesmo que aquele envio
falhe. A agenda inicial distribui eventos dentro do intervalo configurado; os
seguintes usam metade do intervalo mais um deslocamento determinístico menor
que o intervalo. Isso não garante pontualidade sob saturação.

Fontes: [recebimento](../apps/api/src/webhooks/occupancy-webhook.service.ts),
[limitador](../apps/api/src/webhooks/webhook-rate-limiter.service.ts),
[transporte](../apps/simulador/src/transport.ts), [runner local](../apps/simulador/src/runner.ts),
[runner nacional](../apps/simulador/src/national-runner.ts) e
[agenda](../apps/simulador/src/national-scheduler.ts). Payload, limites de corpo
e erros HTTP: [contrato v1](contracts/occupancy-snapshot-v1.md).

## Processamento e persistência

O timer começa após o bootstrap e aguarda seu primeiro intervalo. Uma execução
lenta não é sobreposta pela próxima. Cada execução drena lotes até receber um
lote menor que o limite; a limpeza ocorre depois da drenagem.

`FOR UPDATE SKIP LOCKED` permite trabalhadores concorrentes. Dentro de cada
lote, só o evento mais novo de cada unidade disputa a projeção atual. A ordem
é lexicográfica crescente por `occurredAt`, `observedAt`, `receivedAt`, `eventId`;
vence a maior tupla. Todos os eventos do lote são marcados como `processed`,
inclusive os que não substituem o estado atual. Atualização, marcação e
notificação pertencem à mesma instrução transacional.

Se o lote falhar, o processador tenta cada evento isoladamente. Erros TypeORM
com SQLSTATE das classes `22` (dados) e `23` (integridade) marcam o evento como
`failed`, com motivo limitado a 500 caracteres. Outros erros deixam o evento
pendente para futura execução. `failed` não volta automaticamente à fila.

| Configuração da API | Padrão |
| --- | ---: |
| `OCCUPANCY_PROCESSOR_INTERVAL_MS` | 2.000 ms |
| `OCCUPANCY_PROCESSOR_BATCH_SIZE` | 500 eventos |
| `OCCUPANCY_STALE_AFTER_MINUTES` | 20 minutos |
| `OCCUPANCY_HISTORY_HOURS` | 24 horas |
| `OCCUPANCY_RETENTION_HOURS` | 168 horas |

Os valores numéricos precisam ser inteiros positivos; retenção não pode ser
menor que a janela de histórico. O processador é ativo por padrão, salvo
`OCCUPANCY_PROCESSOR_ENABLED=false`. A exposição pública exige exatamente
`OCCUPANCY_SIMULATION_ENABLED=true`.

A limpeza tenta executar no máximo uma vez por hora por processo e remove
somente `processed` com `received_at` anterior ao corte. Não remove `pending`,
`failed` ou `occupancy_current`. O histórico filtra por `occurred_at`, retorna
os 2.000 pontos mais recentes dentro da janela e os apresenta em ordem
cronológica. Assim, janela consultável não garante 2.000 pontos completos para
uma fonte com frequência muito alta, nem preservação de tudo indefinidamente.

Fontes: [processador](../apps/api/src/occupancy/occupancy-processor.service.ts),
[SQL e histórico](../apps/api/src/database/repositories/occupancy.repository.ts),
[configuração](../apps/api/src/occupancy/occupancy-settings.ts).

## Percentuais, confirmação e histórico visual

- Total = soma dos ocupados / soma das capacidades das categorias informadas.
  Categoria ausente não equivale a zero; capacidade total zero resulta em `null`.
- O percentual exibido usa `Math.round(ratio * 100)`. A faixa usa a proporção
  original: baixa abaixo de 0,60; moderada de 0,60 até menos de 0,85; alta a
  partir de 0,85. Logo, 59,6% pode aparecer como **60% e faixa baixa**, e 84,6%
  como **85% e faixa moderada**.
- Confirmação vence quando a idade de `observedAt` é estritamente maior que o
  limite. Mantém o percentual, mas retira a faixa (`level: null`). Não transforma
  um valor antigo em zero nem apaga a projeção.
- Pontos históricos são classificados no instante observado; não vencem por
  terem envelhecido desde então. Estado atual e último ponto recebido podem
  diferir com eventos atrasados.
- O gráfico usa os pontos retornados; a tabela conserva o último de cada hora
  de `occurredAt`. Ausência de percentual interrompe a linha; ausência de
  amostras, sozinha, não insere automaticamente um ponto nulo.
- Horários de ocupação usam explicitamente `America/Sao_Paulo`. O navegador
  verifica expiração a cada 15 s, ajustando seu relógio pelo `generatedAt` da
  resposta; isso não é polling nem sincronização completa de relógios.

Fontes: [resumo](../apps/api/src/occupancy/occupancy-status.ts),
[histórico da API](../apps/api/src/occupancy/occupancy.service.ts),
[gráfico/tabela](../apps/web/src/occupancyHistory.ts),
[formatação](../apps/web/src/occupancy.ts) e
[camada](../apps/web/src/OccupancyLayerProvider.tsx).

## Navegação e cache cadastral

| Regra | Comportamento |
| --- | --- |
| Busca | Substring de nome e endereço, ignorando acentos e caixa; não pesquisa horário ou todas as propriedades |
| Ordem da lista | UF, município e nome, com comparação `pt-BR`; sem ranking por ocupação |
| Filtros na URL | `uf` e `q`; escrita do texto após pausa de 300 ms, com `replace`, sem uma entrada de histórico por tecla |
| Camada de ocupação | Inicialmente desligada sem escolha anterior; guarda escolha em `sessionStorage`; desligar limpa o filtro “somente simuladas” |
| Cache do navegador | Em memória por UF, sem TTL explícito; retry remove a chave; correções pela tela administrativa limpam o cache local |
| Cache da API | Por UF/visão nacional: 6 h normal, 5 min para geometria não validada, 1 h para histórico geográfico incompleto, 5 min para snapshot de contingência |
| Requisições simultâneas | Uma carga compartilhada por chave na API; invalidação impede carga antiga de repopular aquele cache |
| Falha cadastral | Última resposta `live` marcada como desatualizada; sem ela, snapshot incorporado com procedência e aviso |

O cache do navegador não revalida automaticamente ao vencer o cache do servidor.
A ingestão em processo separado não invalida os caches das APIs. Correção manual
invalida UF e visão nacional apenas na instância que a atende; outras instâncias
e navegadores não recebem invalidação cadastral por SSE de ocupação.

Fontes: [busca e ordem](../apps/web/src/units.ts),
[URL](../apps/web/src/SearchFiltersProvider.tsx),
[cache local](../apps/web/src/useUnits.ts), [cache da API](../apps/api/src/units/units.service.ts).
Enriquecimentos geográficos: [ADR 0001](adr/0001-public-health-unit-data-source.md).
