# FilaSaúde API

API NestJS responsável por integrar e normalizar dados públicos consumidos pelo
frontend do FilaSaúde.

## Desenvolvimento

Execute os comandos a partir da raiz do monorepo:

```bash
pnpm install
pnpm --filter @filasaude/api dev
```

A API inicia em `http://localhost:3000`. O endpoint
`GET http://localhost:3000/health` permite verificar seu estado.

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
