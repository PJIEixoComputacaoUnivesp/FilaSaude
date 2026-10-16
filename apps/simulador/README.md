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
- ocupações iniciais manuais por unidade e categoria para demonstrações.

A API autentica, valida e guarda os eventos na inbox; um processador aplica o
estado atual e o histórico ([#78](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/78)).
Com `OCCUPANCY_SIMULATION_ENABLED=true`, o site mostra o resultado na camada
"Ocupação simulada".

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
| `--scenario` | `SIMULATOR_SCENARIO` | `normal` | Cenário `normal`, `duplicate`, `delayed`, `showcase`, `surge`, `outage` ou `replay` |
| `--delay-seconds` | `SIMULATOR_DELAY_SECONDS` | `0` | Atraso dos timestamps no cenário `delayed` |
| `--follow-site` | `SIMULATOR_FOLLOW_SITE` | `false` | Segue o cenário escolhido no site |

As unidades são selecionadas uma vez no início da execução e permanecem fixas.
O estado é mantido somente em memória e é perdido ao encerrar o processo.

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

### Cenário `showcase` (site publicado)

O `showcase` mantém, ao mesmo tempo e de forma contínua, os estados do roteiro
da proposta 0001. Os papéis seguem a ordem dos CNES da amostra; as demais
unidades seguem o comportamento normal:

| Posição | Comportamento | O que o site mostra |
| ---: | --- | --- |
| 1ª | ocupação fixa em cerca de 90% | faixa alta |
| 2ª | ocupação fixa em cerca de 70% | faixa moderada |
| 3ª | ocupação fixa em cerca de 30% | faixa baixa |
| 4ª | alterna 30 minutos enviando e 30 minutos em silêncio, alinhados ao relógio | "sem confirmação recente" e a retomada com snapshot completo |
| 5ª | reenvia cada snapshot com o mesmo `eventId` | nada muda (idempotência) |
| 6ª | envia também um snapshot 10 minutos no passado | o atraso fica no histórico sem substituir o estado atual |

### Cenários escolhidos no site

Com `--follow-site true` (ou `SIMULATOR_FOLLOW_SITE=true`), o simulador
consulta `GET /occupancy/simulation` a cada 10 segundos e passa a executar o
cenário escolhido por um visitante do site. Quando a escolha muda, um ciclo
novo começa sem esperar o intervalo completo, mas no mínimo 30 segundos após o
ciclo anterior. A API recusa trocas com menos de 15 segundos de intervalo e
volta ao `showcase` depois de 15 minutos. Se a consulta falhar, o cenário
atual continua.

| Cenário | Comportamento |
| --- | --- |
| `showcase` | Papéis fixos descritos acima |
| `normal` | Variação aleatória de cada unidade |
| `surge` | A ocupação sobe 10% da capacidade a cada ciclo, até 95% |
| `outage` | Nada é enviado; depois do prazo, "sem confirmação recente" |
| `replay` | Cada snapshot é reenviado e acompanhado de um evento 10 minutos no passado |

## Configuração compartilhada com a API

Sem `SIMULATOR_SOURCE_SECRET`, o simulador lê o segredo da fonte em
`WEBHOOK_SOURCE_CONFIG`, a mesma variável da API. Sem critério de seleção
(CNES, município, cidade ou coordenadas), a amostra é a lista `unitCnes`
autorizada para a fonte. Assim o segredo e a amostra ficam num lugar só, e o
simulador nunca envia para uma unidade que a API recusaria.

Com o Compose, o simulador é um serviço do perfil `simulation`:

```bash
export OCCUPANCY_SIMULATION_ENABLED=true
export WEBHOOK_SOURCE_CONFIG='{"occupancy-feed":{"secret":"<openssl rand -hex 32>","unitCnes":["0004340","0017396","0050571","0466611","0924857","0932280","2339315","6481876","7429398","7458606"]}}'
docker compose --profile simulation up --build
```

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
