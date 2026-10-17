# Simulador de ocupação de leitos

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

A API autentica e guarda os eventos na inbox; um processador independente
atualiza a ocupação atual e o histórico. Com `OCCUPANCY_SIMULATION_ENABLED=true`,
o site apresenta esses dados no mapa, na lista e no detalhe, sempre como simulação.
A geração nacional continua mesmo sem visitantes. Localização, UF, busca e
interruptor da camada alteram apenas o que cada visitante consulta e visualiza.

### O que a ocupação representa

Nesta entrega, o simulador produz quantidades ocupadas e capacidades fictícias
de leitos de observação, estabilização e internação. A cor do mapa usa o total
ocupado dividido pela capacidade total das categorias informadas; o detalhe
mostra cada categoria. As capacidades não vêm do cadastro CNES e não representam
o inventário real de cada unidade.

Não são geradas pessoas em espera, pessoas em atendimento nem atendimentos
concluídos, e o percentual não estima fila, espera ou capacidade de atendimento.
Essas métricas ficam para as issues #107, #108, #109 e #110. Refs #106.

### Como a seed gera a ocupação

A seed é um texto usado como ponto de partida para cálculos reproduzíveis.
A configuração em [`src/config.ts`](src/config.ts) procura primeiro `--seed`,
depois `SIMULATOR_SEED` e, na ausência dos dois, usa `fila-saude-v1`.
Esse nome é apenas o valor padrão; não identifica um serviço ou cadastro externo.

A CLI cria um `SimulationState` com essa seed. Em
[`src/simulation.ts`](src/simulation.ts), o estado de cada CNES é inicializado
uma única vez por execução, com capacidades fictícias nestas faixas inclusivas:

| Categoria | Código | Capacidade gerada |
| --- | --- | --- |
| Observação | `observation` | 20 a 60 |
| Estabilização | `stabilization` | 4 a 12 |
| Internação | `inpatient` | 8 a 24 |

Para o CNES `5567335`, por exemplo, a capacidade de observação usa o texto
`fila-saude-v1:5567335:observation:capacity`. A ocupação inicial usa
`fila-saude-v1:5567335:observation:occupied` e fica entre zero e a capacidade
gerada. `--set-occupied` pode substituir essa ocupação inicial.

Cada texto passa por SHA-256. Os primeiros quatro bytes do hash são lidos como
um inteiro sem sinal de 32 bits, em ordem big-endian. A função converte esse
inteiro para a faixa desejada:

```ts
const digest = createHash('sha256').update(text).digest();
const value = digest.readUInt32BE(0) / 4_294_967_296;
const result = minimum + Math.floor(value * (maximum - minimum + 1));
```

Após o primeiro snapshot, cada atualização do estado usa
`${seed}:${unitCnes}:${code}:${occurrence}`, com contador iniciado em `1`,
para calcular uma variação de −2 a +2 vagas ocupadas por categoria. No runner
local, esse contador acompanha os ciclos; no nacional, acompanha as ocorrências
de cada unidade. Aplicando `minimum = -2` e `maximum = 2`, o cálculo fica
`-2 + Math.floor(value * 5)`:

| Valor normalizado (`value`) | Variação |
| --- | ---: |
| 0 até menos de 0,2 | −2 |
| 0,2 até menos de 0,4 | −1 |
| 0,4 até menos de 0,6 | 0 |
| 0,6 até menos de 0,8 | +1 |
| 0,8 até menos de 1 | +2 |

Por exemplo, `value = 0.73` produz `-2 + Math.floor(0.73 * 5) = 1`.
A ocupação resultante é limitada a zero e à capacidade da categoria, que
permanece fixa durante a execução.

O fluxo completo é: **configuração da seed → geração das capacidades e ocupações
→ snapshots enviados por webhook → processamento na API → exibição no site**.
A API recebe as quantidades geradas; não precisa da seed para calcular o
percentual de ocupação. O SHA-256 usado na geração dos números é separado da
assinatura HMAC-SHA256 que autentica o webhook.

A mesma seed, o mesmo CNES, a mesma categoria e o mesmo contador produzem os
mesmos números. Isso reproduz a sequência de ocupação, mas não os timestamps
ou os IDs dos eventos, que também dependem do horário. Como o estado fica em
memória, reiniciar o processo com a mesma configuração reinicia a sequência.
No cenário nacional, a seed também determina a agenda de envios e a distribuição
dos CNES entre fontes; veja [`src/national-scheduler.ts`](src/national-scheduler.ts)
e [`src/national-runner.ts`](src/national-runner.ts).

Essa variação não considera horário de pico, demanda real ou características
clínicas da unidade.

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

Nos cenários locais, o simulador precisa de um critério de seleção. Por exemplo, por município:

```bash
pnpm --filter @filasaude/simulador dev --municipality-code 3550308 --interval-seconds 120
```

Ou por CNES explícito:

```bash
pnpm --filter @filasaude/simulador dev --unit-cnes 1234567,7654321 --interval-seconds 30
```

### Carga nacional controlada

O cenário `national` cria uma agenda independente para cada unidade retornada
por `/units?state=ALL`. O intervalo é uma referência para a cadência média por
unidade; os eventos não são sincronizados em ciclos globais.

O cenário `national` consulta todas as unidades retornadas por
`/units?state=ALL`, distribui os envios com agenda independente e encerra após
a duração configurada. Ele exige autorização explícita e aceita somente
destino local por padrão:

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
O cenário imprime relatórios parciais conforme `--report-interval-seconds` e um
relatório JSON final com eventos gerados, respostas, retries e percentis de latência. Para permitir um
ambiente controlado não local, use `--allow-nonlocal-target` explicitamente.

Há dois modos de duração. Com um valor positivo em `--duration-seconds`, a
execução termina automaticamente. Com `--duration-seconds 0`, o cenário
`national` continua até receber `CTRL+C` ou `SIGTERM`:

```bash
pnpm --filter @filasaude/simulador dev \
  --scenario national \
  --allow-load-test \
  --duration-seconds 0 \
  --interval-seconds 120 \
  --concurrency 32 \
  --source-ids occupancy-feed-001,occupancy-feed-002
```

O modo contínuo é apropriado para soak tests, mas exige monitoramento do banco,
pois a inbox continuará crescendo enquanto o processamento posterior não
estiver disponível. O cancelamento aguarda as requisições em andamento e emite
o relatório final.

O runner nacional está separado da CLI para permitir futura integração com a
aplicação. Uma página web não deve receber `SIMULATOR_SOURCE_SECRET`; a
integração deverá acionar um serviço backend controlado ou um job autorizado,
reutilizando o runner e suas métricas no lado servidor.

O comportamento de cada evento nacional pode reutilizar os cenários existentes.
Por padrão, os eventos são normais. Para reenviar o primeiro evento de cada
unidade com o mesmo `eventId`, use `--national-event-scenario duplicate`. Para
gerar timestamps atrasados, use `delayed` junto com `--delay-seconds`:

```bash
pnpm --filter @filasaude/simulador dev \
  --scenario national \
  --national-event-scenario delayed \
  --delay-seconds 600 \
  --allow-load-test \
  --duration-seconds 300
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
| `--max-units` | `SIMULATOR_MAX_UNITS` | `10` (`national`: todas) | Limite de unidades |
| `--seed` | `SIMULATOR_SEED` | `fila-saude-v1` | Reprodutibilidade do cenário |
| `--interval-seconds` | `SIMULATOR_INTERVAL_SECONDS` | `120` | Referência da cadência média por unidade |
| `--set-occupied` | `SIMULATOR_SET_OCCUPIED` | — | Valores iniciais `CNES:CATEGORIA:VALOR`, separados por vírgula |
| `--scenario` | `SIMULATOR_SCENARIO` | `normal` | Cenário `normal`, `duplicate`, `delayed` ou `national` |
| `--national-event-scenario` | `SIMULATOR_NATIONAL_EVENT_SCENARIO` | `normal` | Comportamento dos eventos no `national` |
| `--delay-seconds` | `SIMULATOR_DELAY_SECONDS` | `0` | Atraso dos timestamps no cenário `delayed` |
| `--source-ids` | `SIMULATOR_SOURCE_IDS` | fonte única | Fontes sintéticas separadas por vírgula |
| `--duration-seconds` | `SIMULATOR_DURATION_SECONDS` | `300` | Duração; `0` mantém o `national` até cancelamento |
| `--concurrency` | `SIMULATOR_CONCURRENCY` | `10` | Envios simultâneos máximos |
| `--report-interval-seconds` | `SIMULATOR_REPORT_INTERVAL_SECONDS` | `10` | Intervalo dos relatórios parciais |
| `--allow-load-test` | `SIMULATOR_ALLOW_LOAD_TEST` | `false` | Autoriza a carga nacional |
| `--allow-nonlocal-target` | `SIMULATOR_ALLOW_NONLOCAL_TARGET` | `false` | Permite destino não local em ambiente controlado |

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

## Integração nacional com o site

A PR #104 consome o gerador nacional da PR #105. No Compose, o serviço do perfil
`simulation` usa `national`, duração `0` e cadência média de 120 segundos por
unidade. A lista de fontes vem de `SIMULATOR_SOURCE_IDS`; cada segredo é lido
em `WEBHOOK_SOURCE_CONFIG`, compartilhado com a API. Fontes podem ter segredos
diferentes. Um `SIMULATOR_SOURCE_SECRET` explícito continua disponível para
substituir todos os segredos em testes locais.

Antes de iniciar, configure a autorização de cada CNES para a fonte que o hash
da seed lhe atribui, conforme o [roteiro nacional](../../docs/simulator-testing.md#8-carga-nacional-controlada).
Mantenha a mesma seed, a mesma ordem de fontes e o catálogo atualizado. A execução
validada com 1.793 unidades usa 24 fontes para distribuir as requisições abaixo
do limite por fonte. A quantidade precisa ser revista se o catálogo ou a cadência
mudar; reduzi-la a uma fonte não mantém a mesma vazão.

O site oferece somente consultas: não há seletor público de cenários nem
`PUT /occupancy/simulation`. Duplicidade e atraso ficam disponíveis na CLI para
testes controlados. O calendário nacional não segue a posição do usuário.

Para subir e validar a stack completa, consulte
[run-local-stack](../../.agents/skills/run-local-stack/SKILL.md).
