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
| `source`       | Coordenada atual do CNES.                                                                           |
| `history`      | Ponto de uma publicação mensal anterior do CNES, dentro do município e para o mesmo endereço.       |
| `municipality` | Centro do município, calculado do contorno do IBGE.                                                 |

Fora de `source`, `location.original` guarda a coordenada informada pelo CNES e,
em `history`, `location.referenceMonth` traz a competência (`AAAA-MM`). A
verificação vale também para as consultas `ALL`/`BR`, que vêm do snapshot. O
fallback por UF, usado quando o CNES está indisponível, não consulta o
histórico. Os detalhes e as limitações estão no
[ADR 0001](../../docs/adr/0001-public-health-unit-data-source.md).

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

O serviço deve expor apenas dados públicos e nunca oferecer diagnóstico,
triagem, orientação médica ou recomendação de unidades.
