# FilaSaúde API

API NestJS responsável por integrar e normalizar dados públicos consumidos pelo
frontend do FilaSaúde.

## Desenvolvimento

Execute os comandos a partir da raiz do monorepo:

```bash
pnpm install
pnpm --filter @filasaude/api dev
```

A API inicia em `http://localhost:3000`.

| Endpoint               | Descrição                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `GET /health`          | Verifica o estado da API.                                        |
| `GET /units`           | Lista unidades públicas de pronto atendimento de todo o Brasil. |
| `GET /units?state=SP`  | Lista unidades públicas de pronto atendimento da UF informada.  |
| `GET /units?state=ALL` | Lista unidades de todo o Brasil a partir do snapshot local.      |
| `POST /webhooks/v1/occupancy` | Recebe snapshots de ocupação assinados.              |

### Webhook de ocupação

O endpoint `POST /webhooks/v1/occupancy` recebe um snapshot por unidade CNES,
autentica a fonte com HMAC-SHA256, valida o contrato v1 e persiste o evento na
inbox antes de responder `202 Accepted`. O processamento posterior da inbox
ainda não faz parte deste endpoint.

Configure as fontes por meio de `WEBHOOK_SOURCE_CONFIG`, exclusivamente no
ambiente de execução. O valor é um objeto JSON em que cada fonte possui um
segredo e a lista de unidades CNES autorizadas:

```bash
WEBHOOK_SECRET="$(openssl rand -hex 32)"
printf '{"academic-simulator":{"secret":"%s","unitCnes":["1234567"]}}\n' "$WEBHOOK_SECRET"
```

Os cabeçalhos obrigatórios são `X-Webhook-Source`,
`X-Webhook-Timestamp` (Unix em segundos) e `X-Webhook-Signature`
(`sha256=<hexadecimal>`). A assinatura usa o timestamp, um ponto e o corpo
bruto da requisição. O payload e os vetores de assinatura estão documentados
em [`docs/contracts/occupancy-snapshot-v1.md`](../../docs/contracts/occupancy-snapshot-v1.md), que tambÃ©m traz um vetor fixo para validar implementaÃ§Ãµes independentes.

O endpoint de unidades consulta diretamente os tipos oficiais `20` (pronto
socorro geral), `21` (pronto socorro especializado) e `73` (pronto atendimento)
do Cadastro Nacional de Estabelecimentos de Saúde (CNES), mantém o resultado em memória por seis horas e usa
um snapshot local com cobertura nacional quando a fonte oficial está indisponível.
O parâmetro `state` aceita qualquer sigla de UF ou `ALL`/`BR` para cobertura
nacional. Sem o parâmetro, a API usa `ALL`. Consultas com `ALL` ou `BR` sempre
retornam o snapshot local (`fallback`), sem consultar o CNES. Os nomes dos
municípios vêm da API de localidades do IBGE. O campo
`metadata.dataOrigin` indica `live` ou `fallback`, e `metadata.isStale` informa
quando a cópia de segurança está sendo exibida.

### Posição das unidades

O CNES é autodeclarado e algumas coordenadas apontam para fora do município. A
API compara a coordenada de cada unidade com o contorno do município no IBGE
(tolerância de 5 km) e nunca remove uma unidade por isso. `location.precision`
informa de onde vem a posição:

| `precision`    | Origem                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `source`       | Coordenada atual de uma fonte pública, identificada em `sources`.                                   |
| `history`      | Ponto de uma publicação mensal anterior do CNES, dentro do município e para o mesmo endereço.       |
| `municipality` | Centro do município, calculado do contorno do IBGE.                                                 |
| `manual`       | Posição definida por um administrador, com a data em `location.correctedAt`.                        |

Uma posição `manual` vale sempre que existir, mesmo sobre uma coordenada do CNES
dentro do município. Fora de `source`, `location.original` guarda a coordenada
informada pelo CNES e, em `history`, `location.referenceMonth` traz a competência
(`AAAA-MM`). A verificação vale também para as consultas `ALL`/`BR`, que vêm do snapshot. O
fallback por UF, usado quando o CNES está indisponível, não consulta o
histórico. Os detalhes e as limitações estão no
[ADR 0001](../../docs/adr/0001-public-health-unit-data-source.md).

Para unidades do município de São Paulo sem posição manual, a API tenta cruzar
o registro com a camada oficial de urgência/emergência do GeoSampa. Uma
correspondência única e forte por nome, CEP ou proximidade substitui somente as
coordenadas. Cada item expõe `sources`, que indica quais campos vieram do CNES e
quais vieram do GeoSampa. Falhas ou correspondências ambíguas preservam a
posição já validada pela API. O conjunto federal “UPA 24h em funcionamento” foi
avaliado apenas como controle agregado por município; a decisão e as licenças
estão documentadas no
[ADR 0002](../../docs/adr/0002-additional-public-data-sources.md).

### Correção manual da posição (administradores)

| Endpoint                                              | Descrição                                      |
| ----------------------------------------------------- | ---------------------------------------------- |
| `GET /admin/me`                                       | Login do dono do token.                        |
| `GET /admin/location-corrections`                     | Lista as correções, com quem verificou e como. |
| `GET /admin/location-corrections/:cnesCode/events`    | Histórico de alterações de uma unidade.        |
| `PUT /admin/location-corrections/:cnesCode`           | Define ou substitui a posição de uma unidade.  |
| `DELETE /admin/location-corrections/:cnesCode`        | Remove a correção.                             |

Exigem `Authorization: Bearer <token>`, com o token pessoal de cada administrador
listado em `ADMIN_API_TOKENS` (`login:token`, separados por vírgula). Sem uma
lista válida configurada, as rotas não existem (404). Quem fez a alteração vem do
token, e não do corpo: o corpo do `PUT` é `{ "latitude", "longitude", "method" }`,
e a posição precisa estar dentro do município da unidade. As respostas pedem
`Cache-Control: no-store`. Para ligar a função em produção, usar a página `/admin`
do site e ver exemplos, veja o
[guia de deploy](../../docs/deployment.md#correções-manuais-de-posição).

## Verificações

```bash
pnpm --filter @filasaude/api lint
pnpm --filter @filasaude/api typecheck
pnpm --filter @filasaude/api test
pnpm --filter @filasaude/api test:e2e
pnpm --filter @filasaude/api build
```

## Banco de dados local

O PostgreSQL de desenvolvimento é iniciado pela raiz do monorepo:

```bash
docker compose up -d postgres
pnpm --filter @filasaude/api migration:run
```

As migrations são executadas explicitamente e `synchronize` permanece desativado.
O Compose injeta `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD` na
API. Ao executar a API diretamente fora do Compose, essas variáveis precisam
ser exportadas no shell; a API não carrega arquivos `.env` automaticamente.

A migration da inbox do webhook é executada pelo mesmo comando
`pnpm --filter @filasaude/api migration:run`.

O serviço deve expor apenas dados públicos e nunca oferecer diagnóstico,
triagem, orientação médica ou recomendação de unidades.
