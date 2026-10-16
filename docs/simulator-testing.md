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

$cnes = @(
  Get-Content apps/api/src/units/units.snapshot.json -Raw |
  ConvertFrom-Json |
  Select-Object -First 2 -ExpandProperty id
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
$cnes = @(
  Get-Content apps/api/src/units/units.snapshot.json -Raw |
  ConvertFrom-Json |
  Select-Object -First 2 -ExpandProperty id
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

## 8. Teste automatizado contra a API

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

## 9. Interpretação dos resultados

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

Com o processamento da inbox (#78), o roteiro também confirma, com
`OCCUPANCY_SIMULATION_ENABLED=true` na API:

- estado atual em `GET /occupancy`, com faixa, percentual e marca de simulação;
- histórico das últimas 24 horas em `GET /units/{cnes}/occupancy-history`;
- duplicidade sem efeito e evento atrasado preservado no histórico sem
  substituir o estado atual;
- "sem confirmação recente" após 20 minutos sem snapshots da unidade.

## Amostra da demonstração

A amostra não é municipal: uma UPA de cada uma de dez UFs, todas com
coordenadas do próprio CNES, para que a camada apareça em várias regiões do
mapa nacional. Os códigos são públicos; o segredo da fonte continua fora do
repositório.

| CNES | UF | Unidade | Papel no `showcase` |
| --- | --- | --- | --- |
| 0004340 | BA | UPA 24H Dr. Hélio Machado (Salvador) | faixa alta |
| 0017396 | PR | UPA Boa Vista (Curitiba) | faixa moderada |
| 0050571 | PA | UPA Marambaia (Belém) | faixa baixa |
| 0466611 | SP | UPA Mooca III (São Paulo) | confirmação intermitente |
| 0924857 | DF | UPA II Ceilândia (Brasília) | duplicidade |
| 0932280 | RJ | UPA 24H Del Castilho (Rio de Janeiro) | evento atrasado |
| 2339315 | GO | UPA Jardim Novo Mundo (Goiânia) | normal |
| 6481876 | PE | UPA Imbiribeira (Recife) | normal |
| 7429398 | CE | UPA Jangurussu (Fortaleza) | normal |
| 7458606 | AM | UPA Campos Salles (Manaus) | normal |

## 10. Encerramento do ambiente

Para parar os contêineres sem remover os dados locais:

```powershell
docker compose down
```

Não use `docker compose down -v` sem a intenção explícita de remover o volume
local do PostgreSQL e todos os dados nele armazenados.
