# syntax=docker/dockerfile:1.7

FROM docker.io/library/node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/simulador/package.json apps/simulador/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @filasaude/simulador

COPY apps/simulador apps/simulador

RUN pnpm --filter @filasaude/simulador build

# The simulator has no runtime dependencies: only Node and the compiled files.
FROM docker.io/library/node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/apps/simulador/dist ./dist
COPY apps/simulador/package.json ./package.json

USER node

CMD ["node", "dist/main.js"]
