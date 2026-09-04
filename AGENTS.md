# AGENTS.md

## Visão geral

FilaSaúde é um monorepo pnpm para uma plataforma informativa sobre unidades
públicas de pronto atendimento. O produto não oferece diagnóstico, triagem,
orientação médica ou recomendação de estabelecimentos.

## Estrutura do repositório

- `apps/web`: frontend React com Vite e TypeScript.
- `apps/api`: API NestJS com TypeScript.
- `packages/*`: bibliotecas compartilhadas, quando necessárias.
- `e2e`: testes de ponta a ponta, quando adicionados.
- `docs`: documentação técnica e decisões de arquitetura.

## Ambiente e comandos

- Use Node.js 24 LTS e pnpm 11.
- Instale dependências com `pnpm install` na raiz.
- Execute todos os projetos em desenvolvimento com `pnpm dev`.
- Antes de concluir uma mudança, rode `pnpm lint`, `pnpm typecheck`,
  `pnpm test` e `pnpm build` conforme o escopo afetado.
- Para um único app, use filtros, por exemplo `pnpm --filter @filasaude/web dev`.

## Convenções de implementação

- Escreva código e nomes técnicos em inglês; documentação e textos de interface
  podem ser escritos em português do Brasil.
- Mantenha TypeScript em modo estrito e evite `any` sem justificativa.
- Prefira módulos pequenos, responsabilidades claras e imports explícitos.
- Não versione segredos. Documente variáveis obrigatórias em `.env.example`.
- Preserve acessibilidade, navegação por teclado e HTML semântico no frontend.
- Valide entradas nas bordas da API e não exponha detalhes internos em respostas.
- Dados de saúde exibidos devem indicar sua fonte pública e data de atualização.
- Não implemente lógica que possa ser interpretada como diagnóstico, triagem ou
  recomendação médica.

## Git e revisão

- Faça commits pequenos e focados, usando Conventional Commits.
- Não inclua arquivos gerados, dependências ou configurações pessoais do editor.
- Inclua ou atualize testes sempre que o comportamento mudar.
- Descreva no PR o objetivo, como validar e eventuais riscos ou pendências.
