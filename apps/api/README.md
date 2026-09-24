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

| Endpoint      | Descrição                                                                |
| ------------- | ------------------------------------------------------------------------ |
| `GET /health` | Verifica o estado da API.                                                |
| `GET /units`  | Lista unidades públicas de pronto atendimento do município de São Paulo. |

O endpoint de unidades consulta o Cadastro Nacional de Estabelecimentos de
Saúde (CNES) diretamente, mantém o resultado em memória por seis horas e usa
um snapshot local somente quando a fonte oficial está indisponível. O campo
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
