# Roteiro de teste do `occupancy-feed`

Este roteiro valida o fluxo disponível atualmente:

```text
occupancy-feed → assinatura HMAC → API → validação → inbox PostgreSQL
```

O teste ainda não valida a exibição de ocupação no frontend. Nesta etapa, a API
guarda os snapshots na inbox, mas ainda não os transforma em ocupação atual ou
histórico público. Essa parte depende das issues [#78](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/78) e [#79](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/79).

## Pré-requisitos

- Node.js 24.15 ou superior na série 24;
- pnpm 11;
- Docker ou Podman em execução;
- dependências instaladas com `pnpm install`;
- dois terminais PowerShell disponíveis.

O identificador da fonte é `occupancy-feed`. Esse valor precisa ser igual em
`SIMULATOR_SOURCE_ID`, `WEBHOOK_SOURCE_CONFIG` e no cabeçalho enviado à API.
O segredo deve ter pelo menos 32 caracteres e nunca deve ser versionado.

## 1. Validar o pacote isoladamente

Na raiz do repositório:

```powershell
pnpm.cmd --filter @filasaude/simulador lint
pnpm.cmd --filter @filasaude/simulador typecheck
pnpm.cmd --filter @filasaude/simulador test
pnpm.cmd --filter @filasaude/simulador build
```

Também é possível verificar a ajuda da CLI:

```powershell
node --experimental-strip-types apps/simulador/src/main.ts --help
```

## 2. Iniciar o PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps
```

O serviço `postgres` deve aparecer como ativo e saudável.

## 3. Configurar e migrar a API

No primeiro terminal, defina um segredo local e autorize dois CNES do snapshot
incorporado da API:

```powershell
$secret = 'local-occupancy-feed-secret-32-chars'

$snapshot = Get-Content apps/api/src/units/units.snapshot.json -Raw |
  ConvertFrom-Json
$cnes = @(
  $index = 0
  foreach ($unit in $snapshot) {
    if ($index -ge 2) { break }
    [string]$unit.id
    $index++
  }
)

$env:DB_HOST = 'localhost'
$env:DB_PORT = '5432'
$env:DB_NAME = 'filasaude'
$env:DB_USER = 'filasaude'
$env:DB_PASSWORD = 'filasaude'
$env:WEBHOOK_SOURCE_CONFIG = @{
  'occupancy-feed' = @{
    secret = $secret
    unitCnes = $cnes
  }
} | ConvertTo-Json -Compress
```

Execute as migrations:

```powershell
pnpm.cmd --filter @filasaude/api migration:run
```

Inicie a API nesse mesmo terminal:

```powershell
pnpm.cmd --filter @filasaude/api dev
```

Mantenha esse terminal aberto.

## 4. Verificar a API

No segundo terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod 'http://localhost:3000/units?state=ALL'
```

As duas chamadas devem responder normalmente. A consulta `state=ALL` utiliza o
snapshot nacional local da API.

## 5. Executar o `occupancy-feed`

Ainda no segundo terminal, prepare a mesma lista de CNES e o segredo do
simulador:

```powershell
$secret = 'local-occupancy-feed-secret-32-chars'
$snapshot = Get-Content apps/api/src/units/units.snapshot.json -Raw |
  ConvertFrom-Json
$cnes = @(
  $index = 0
  foreach ($unit in $snapshot) {
    if ($index -ge 2) { break }
    [string]$unit.id
    $index++
  }
)
$unitList = $cnes -join ','
$env:SIMULATOR_SOURCE_ID = 'occupancy-feed'
$env:SIMULATOR_SOURCE_SECRET = $secret
```

Execute ciclos curtos para observar o comportamento:

```powershell
node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --state ALL `
  --unit-cnes $unitList `
  --interval-seconds 10
```

O intervalo de 10 segundos com duas unidades permanece abaixo do limite inicial
de 60 requisições por minuto por fonte.

Resultado esperado:

- o catálogo é carregado;
- as unidades selecionadas são exibidas;
- o primeiro ciclo é enviado imediatamente;
- cada unidade recebe um snapshot;
- a API responde `202`;
- o processo registra `sourceId=occupancy-feed`, `eventId`, unidade, tentativas
  e status;
- novos ciclos são enviados a cada 10 segundos.

Interrompa com `Ctrl+C`. O simulador deve exibir a mensagem de encerramento e
finalizar sem erro.

## 6. Verificar a inbox PostgreSQL

Com o simulador em execução ou após interrompê-lo:

```powershell
docker compose exec -T postgres psql `
  -U filasaude `
  -d filasaude `
  -c "SELECT source_id, event_id, unit_cnes, status, received_at FROM occupancy_webhook_inbox ORDER BY received_at DESC LIMIT 10;"
```

Os registros esperados devem conter:

- `source_id` igual a `occupancy-feed`;
- os CNES selecionados;
- `status` igual a `pending`;
- um novo `event_id` em cada snapshot;
- horários recentes em `received_at`.

## 7. Testar um cenário controlado

O simulador aceita ocupações iniciais por categoria. Use um valor baixo para
não exceder a capacidade determinística:

```powershell
$override = "$($cnes[0]):observation:1"

node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --state ALL `
  --unit-cnes $unitList `
  --set-occupied $override `
  --interval-seconds 10
```

Para mais de uma unidade ou categoria:

```text
--set-occupied 1234567:observation:1,7654321:inpatient:2
```

Os CNES do override precisam estar entre as unidades selecionadas.

Para demonstrar idempotência, execute o primeiro ciclo com o cenário
`duplicate`. Cada unidade será enviada duas vezes com o mesmo `eventId` e o
mesmo corpo; a segunda ocorrência deve ser aceita como duplicidade idêntica:

```powershell
node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --state ALL `
  --unit-cnes $unitList `
  --scenario duplicate `
  --interval-seconds 120
```

Para demonstrar um evento atrasado:

```powershell
node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --state ALL `
  --unit-cnes $unitList `
  --scenario delayed `
  --delay-seconds 600 `
  --interval-seconds 120
```

No cenário `delayed`, a API ainda pode aceitar o evento na inbox, mas o
processamento posterior deverá decidir como tratar sua precedência temporal.

## 8. Carga nacional controlada

O cenário `national` usa todas as unidades retornadas por `state=ALL`, distribui
os envios com jitter determinístico e produz métricas de respostas, retries e
latência. Ele exige `--allow-load-test` e aceita somente `localhost` por padrão.

Para autorizar duas fontes sintéticas no ambiente local, configure ambas antes
de iniciar a API. O segredo pode ser o mesmo porque se trata de uma carga local:

```powershell
$secret = 'local-national-load-secret-32-chars'
$snapshot = Get-Content apps/api/src/units/units.snapshot.json -Raw |
  ConvertFrom-Json
$allCnes = @(
  foreach ($unit in $snapshot) {
    $id = [string]$unit.id
    if ($id -match '^\d{7}$') { $id }
  }
)
$testCnes = @($allCnes | Sort-Object | Select-Object -First 20)
$config = [ordered]@{
  'occupancy-feed-001' = @{ secret = $secret; unitCnes = $testCnes }
  'occupancy-feed-002' = @{ secret = $secret; unitCnes = $testCnes }
} | ConvertTo-Json -Depth 4 -Compress
$env:WEBHOOK_SOURCE_CONFIG = $config
$env:SIMULATOR_SOURCE_SECRET = $secret
```

Em outro terminal, com a API e o PostgreSQL em execução:

```powershell
$env:SIMULATOR_SOURCE_IDS = 'occupancy-feed-001,occupancy-feed-002'
node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --scenario national `
  --allow-load-test `
  --duration-seconds 300 `
  --interval-seconds 120 `
  --concurrency 10
```

O terminal exibe relatórios parciais e um relatório final. O teste mede a
ingestão do simulador até a inbox. Processamento, estado atual e backlog
dependem da issue #78. Não execute este cenário contra produção.

O `--interval-seconds` é uma referência para a cadência de cada unidade, e não
um ciclo em que todas enviam juntas. O simulador cria uma agenda determinística
independente por CNES. A mesma seed reproduz a mesma agenda, enquanto unidades
diferentes chegam em momentos diferentes.

Para combinar a carga nacional com os cenários de comportamento existentes:

```powershell
# Reenvia o primeiro evento de cada unidade com o mesmo eventId
node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --scenario national `
  --national-event-scenario duplicate `
  --allow-load-test `
  --duration-seconds 60

# Gera eventos nacionais com timestamps 10 minutos atrasados
node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --scenario national `
  --national-event-scenario delayed `
  --delay-seconds 600 `
  --allow-load-test `
  --duration-seconds 60
```

Todas as unidades continuam sendo enviadas para a API, independentemente da
posição do usuário. A posição deve influenciar somente as consultas e os dados
exibidos no mapa.

O bloco acima é o teste nacional limitado. Para uma execução com todas as
unidades, não basta remover `--max-units`: a API aplica limite de requisições por
fonte. O procedimento validado usa 24 fontes sintéticas e distribui os CNES de
forma determinística, usando a mesma regra do simulador.

No terminal da API, com o PostgreSQL em execução:

```powershell
$secret = 'local-national-load-secret-32-chars'
$seed = 'fila-saude-v1'
$sourceCount = 24
$sourceIds = @(
  1..$sourceCount | ForEach-Object {
    'occupancy-feed-{0:D3}' -f $_
  }
)

$snapshot = Get-Content apps/api/src/units/units.snapshot.json -Raw |
  ConvertFrom-Json
$allCnes = @(
  foreach ($unit in $snapshot) {
    $id = [string]$unit.id
    if ($id -match '^\d{7}$') { $id }
  }
) | Sort-Object -Unique

$partitions = @{}
foreach ($sourceId in $sourceIds) {
  $partitions[$sourceId] = [System.Collections.Generic.List[string]]::new()
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
foreach ($cnes in $allCnes) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("${seed}:$cnes")
  $digest = $sha256.ComputeHash($bytes)
  $hashValue = [uint32](
    ([uint32]$digest[0] * 16777216) +
    ([uint32]$digest[1] * 65536) +
    ([uint32]$digest[2] * 256) +
    [uint32]$digest[3]
  )
  $index = [int]($hashValue % [uint32]$sourceCount)
  $partitions[$sourceIds[$index]].Add($cnes)
}

$sourceConfig = [ordered]@{}
foreach ($sourceId in $sourceIds) {
  $sourceConfig[$sourceId] = @{
    secret = $secret
    unitCnes = @($partitions[$sourceId])
  }
}

$env:WEBHOOK_SOURCE_CONFIG = (
  $sourceConfig | ConvertTo-Json -Depth 4 -Compress
)

Write-Output "CNES totais: $($allCnes.Count)"
$partitions.GetEnumerator() |
  Sort-Object Name |
  ForEach-Object { Write-Output "$($_.Key): $($_.Value.Count) CNES" }
```

O total esperado é `1793`. Depois, reinicie a API para carregar a nova
configuração:

```powershell
Ctrl+C
pnpm --filter @filasaude/api dev
```

No terminal do simulador:

```powershell
$env:SIMULATOR_SOURCE_SECRET = 'local-national-load-secret-32-chars'
$env:SIMULATOR_SOURCE_IDS = (
  1..24 | ForEach-Object { 'occupancy-feed-{0:D3}' -f $_ }
) -join ','

node --experimental-strip-types apps/simulador/src/main.ts `
  --api-url http://localhost:3000 `
  --source-ids $env:SIMULATOR_SOURCE_IDS `
  --scenario national `
  --allow-load-test `
  --duration-seconds 180 `
  --interval-seconds 120 `
  --concurrency 32
```

Durante a execução, acompanhe a distribuição por fonte:

```powershell
docker compose exec -T postgres psql `
  -U filasaude `
  -d filasaude `
  -c "SELECT source_id, COUNT(*) AS total, MIN(received_at) AS primeiro, MAX(received_at) AS ultimo FROM occupancy_webhook_inbox WHERE source_id LIKE 'occupancy-feed-%' GROUP BY source_id ORDER BY source_id;"
```

Para comparar somente uma execução, filtre `received_at` a partir do horário de
início do teste. Os registros das fontes `001` e `002` podem incluir dados de
testes limitados anteriores.

O teste validado produziu 2.724 eventos aceitos para 1.793 unidades, sem erros,
sem `429` e sem retries. Os valores de latência observados foram p50 de
13–15 ms, p95 de 22–26 ms e p99 de 28–33 ms. Esses números caracterizam apenas
o ambiente local utilizado e não substituem uma medição de produção.

## 9. Teste automatizado contra a API

Com a API em execução e o segredo já definido no terminal do simulador:

```powershell
$env:SIMULATOR_INTEGRATION_API_URL = 'http://localhost:3000'
$env:SIMULATOR_INTEGRATION_UNIT_CNES = $cnes[0]
pnpm.cmd --filter @filasaude/simulador test:integration
```

O teste usa o transporte real do simulador, envia um snapshot ao endpoint real
e espera `202`. A persistência pode ser confirmada na inbox com a consulta da
seção anterior. Sem essas variáveis, o teste é ignorado para permitir a execução
da suíte padrão sem uma API externa.

## 10. Interpretação dos resultados

Este roteiro confirma:

- seleção de unidades;
- geração determinística;
- aplicação de overrides;
- assinatura do corpo bruto;
- autenticação da fonte;
- autorização por CNES;
- retentativas do transporte;
- persistência na inbox;
- encerramento gracioso.

Este roteiro ainda não confirma:

- ocupação atual em `GET /units`;
- histórico de ocupação;
- atualização do mapa ou da lista;
- polling ou SSE;
- rollback de dados processados.

Esses comportamentos dependem do processamento de ocupação da API e das
respectivas entregas do frontend.

## 10. Encerramento do ambiente

Para parar os contêineres sem remover os dados locais:

```powershell
docker compose down
```

Não use `docker compose down -v` sem a intenção explícita de remover o volume
local do PostgreSQL e todos os dados nele armazenados.
