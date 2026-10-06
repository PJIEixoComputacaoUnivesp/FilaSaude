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

## Verificações

```bash
pnpm --filter @filasaude/api lint
pnpm --filter @filasaude/api typecheck
pnpm --filter @filasaude/api test
pnpm --filter @filasaude/api test:e2e
pnpm --filter @filasaude/api build
```

O serviço deve expor apenas dados públicos e nunca oferecer diagnóstico,
triagem, orientação médica ou recomendação de unidades.
