# Simulador municipal de ocupação

O `@filasaude/simulador` é uma CLI para gerar snapshots sintéticos de ocupação
e enviá-los à API por meio do webhook assinado. Ele existe para testes e
demonstrações acadêmicas; os valores gerados não representam dados reais de
unidades de saúde.

## Estado atual

O simulador já oferece:

- seleção determinística de unidades por CNES, município, cidade ou raio;
- estado em memória por unidade e por categoria;
- cenários reproduzíveis por `seed`;
- snapshots completos para `observation`, `stabilization` e `inpatient`;
- assinatura HMAC-SHA256 conforme o contrato v1;
- retentativas para falhas transitórias e `429`, respeitando `Retry-After`;
- envio periódico, com primeiro ciclo imediato;
- encerramento gracioso com `Ctrl+C`.
- cenário nacional distribuído com jitter determinístico, concorrência limitada
  e métricas de envio.
- ocupações iniciais manuais por unidade e categoria para demonstrações.

O simulador ainda não altera o estado atual exibido pela aplicação. A API, nesta
etapa, autentica, valida e guarda os eventos na inbox; o processamento de
ocupação está planejado na issue [#78](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/78).

## Pré-requisitos

Na raiz do monorepo:

```bash
pnpm install
```

Para enviar snapshots, a API deve estar acessível e a fonte deve estar
configurada em `WEBHOOK_SOURCE_CONFIG`. O `sourceId`, o segredo e os CNES devem
ser os mesmos nos dois processos. Não versione nenhum segredo.

Exemplo somente para desenvolvimento local, usando valores fictícios:

```bash
export SIMULATOR_SOURCE_ID=occupancy-feed
export SIMULATOR_SOURCE_SECRET='local-simulator-secret-32-chars-min'
export WEBHOOK_SOURCE_CONFIG='{"occupancy-feed":{"secret":"local-simulator-secret-32-chars-min","unitCnes":["1234567"]}}'
```

No PowerShell, use `$env:NOME='valor'` no lugar de `export NOME='valor'`.
Substitua `1234567` por CNES existentes no catálogo retornado pela API.

## Execução

O simulador precisa de um critério de seleção. Por exemplo, por município:

```bash
pnpm --filter @filasaude/simulador dev --municipality-code 3550308 --interval-seconds 120
```

Ou por CNES explícito:

```bash
pnpm --filter @filasaude/simulador dev --unit-cnes 1234567,7654321 --interval-seconds 30
```

### Carga nacional controlada

O cenário `national` consulta todas as unidades retornadas por
`/units?state=ALL`, distribui os envios ao longo do intervalo e encerra após a
duração configurada. Ele exige autorização explícita e aceita somente destino
local por padrão:

```bash
pnpm --filter @filasaude/simulador dev \
  --scenario national \
  --allow-load-test \
  --duration-seconds 300 \
  --interval-seconds 120 \
  --concurrency 10 \
  --source-ids occupancy-feed-001,occupancy-feed-002
```

As fontes sintéticas precisam estar configuradas no `WEBHOOK_SOURCE_CONFIG`,
com o mesmo segredo local e com os CNES que cada fonte poderá atualizar. O
particionamento das unidades entre fontes é determinístico para a mesma seed.
O cenário imprime relatórios parciais por ciclo e um relatório JSON final com
eventos gerados, respostas, retries e percentis de latência. Para permitir um
ambiente controlado não local, use `--allow-nonlocal-target` explicitamente.

Opções também podem ser informadas pelas variáveis `SIMULATOR_*`. Os principais
parâmetros são:

| Opção | Variável | Padrão | Finalidade |
| --- | --- | ---: | --- |
| `--api-url` | `SIMULATOR_API_URL` | `http://localhost:3000` | URL base da API |
| `--source-id` | `SIMULATOR_SOURCE_ID` | `occupancy-feed` | Fonte autenticada |
| `--state` | `SIMULATOR_STATE` | — | UF usada no catálogo |
| `--municipality-code` | `SIMULATOR_MUNICIPALITY_CODE` | — | Município prioritário |
| `--city` | `SIMULATOR_CITY` | — | Cidade alternativa |
| `--unit-cnes` | `SIMULATOR_UNIT_CNES` | — | CNES separados por vírgula |
| `--radius-km` | `SIMULATOR_RADIUS_KM` | `25` | Raio para seleção por coordenadas |
| `--max-units` | `SIMULATOR_MAX_UNITS` | `10` | Limite de unidades |
| `--seed` | `SIMULATOR_SEED` | `fila-saude-v1` | Reprodutibilidade do cenário |
| `--interval-seconds` | `SIMULATOR_INTERVAL_SECONDS` | `120` | Intervalo entre ciclos |
| `--set-occupied` | `SIMULATOR_SET_OCCUPIED` | — | Valores iniciais `CNES:CATEGORIA:VALOR`, separados por vírgula |
| `--scenario` | `SIMULATOR_SCENARIO` | `normal` | Cenário `normal`, `duplicate` ou `delayed` |
| `--delay-seconds` | `SIMULATOR_DELAY_SECONDS` | `0` | Atraso dos timestamps no cenário `delayed` |
| `--source-ids` | `SIMULATOR_SOURCE_IDS` | fonte única | Fontes sintéticas separadas por vírgula |
| `--duration-seconds` | `SIMULATOR_DURATION_SECONDS` | `300` | Duração do cenário `national` |
| `--concurrency` | `SIMULATOR_CONCURRENCY` | `10` | Envios simultâneos máximos |
| `--allow-load-test` | `SIMULATOR_ALLOW_LOAD_TEST` | `false` | Autoriza a carga nacional |

As unidades são selecionadas uma vez no início da execução e permanecem fixas.
O estado é mantido somente em memória e é perdido ao encerrar o processo.

O cenário nacional é uma carga de ingestão do cliente até a inbox. Ele não mede
processamento, estado atual ou backlog escoado, que dependem da issue
[#78](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/78).

Exemplo de cenário com ocupação inicial controlada:

```bash
pnpm --filter @filasaude/simulador dev --unit-cnes 1234567,7654321 --set-occupied 1234567:observation:13,7654321:inpatient:4
```

Os CNES informados em `--set-occupied` precisam estar entre as unidades
selecionadas, e a ocupação não pode exceder a capacidade determinística da
categoria.

Para demonstrar idempotência, o cenário `duplicate` reenvia cada snapshot do
primeiro ciclo com o mesmo `eventId` e corpo:

```bash
pnpm --filter @filasaude/simulador dev --unit-cnes 1234567 --scenario duplicate --interval-seconds 120
```

Para demonstrar um evento atrasado, informe o atraso em segundos:

```bash
pnpm --filter @filasaude/simulador dev --unit-cnes 1234567 --scenario delayed --delay-seconds 600
```

O cenário `delayed` mantém a cadência normal, mas gera `occurredAt` e
`observedAt` no passado. O cenário `duplicate` atua somente no primeiro ciclo;
os ciclos seguintes seguem o comportamento normal.

## Validação local

```bash
pnpm --filter @filasaude/simulador lint
pnpm --filter @filasaude/simulador typecheck
pnpm --filter @filasaude/simulador test
pnpm --filter @filasaude/simulador build
```

Com a API já iniciada e a fonte configurada, o teste automatizado de integração
pode ser executado com:

```powershell
$env:SIMULATOR_INTEGRATION_API_URL = 'http://localhost:3000'
$env:SIMULATOR_INTEGRATION_UNIT_CNES = '6439837'
pnpm.cmd --filter @filasaude/simulador test:integration
```

O teste usa `SIMULATOR_SOURCE_ID` e `SIMULATOR_SOURCE_SECRET` do terminal atual.
Sem `SIMULATOR_INTEGRATION_API_URL`, `SIMULATOR_SOURCE_SECRET` ou
`SIMULATOR_INTEGRATION_UNIT_CNES`, ele fica marcado como ignorado para não
falhar na CI sem uma API externa.

Para validar apenas o contrato de assinatura, consulte o
[contrato `occupancy.snapshot.v1`](../../docs/contracts/occupancy-snapshot-v1.md),
que contém um vetor fixo independente da API.

Para o teste completo com PostgreSQL e API, consulte o
[roteiro de teste do `occupancy-feed`](../../docs/simulator-testing.md).

## Próximas extensões

- comando de rollback/limpeza de dados simulados, quando houver processamento
  de ocupação na API;
- cenário integrado com API, inbox, processamento e interface;
- roteiro de verificação dos impactos e da identificação visual de dados
  simulados.
