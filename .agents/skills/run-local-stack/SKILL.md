---
name: run-local-stack
description: Start, check and stop the FilaSaúde apps locally (PostgreSQL, API, web and the occupancy simulator) in the right order, with the environment each one needs. Use when asked to run, start, "rodar", "subir" or demo the apps, to see the simulated occupancy working, or before checking a change in the real app.
---

# Run the local stack

The apps depend on each other and none of them reads `.env` on its own, so
the order and the environment matter. The user's instructions take
precedence over this procedure.

## What runs where

| Piece | Command | Port | Depends on |
| --- | --- | --- | --- |
| PostgreSQL | `docker compose up -d postgres` | 5432 (localhost) | — |
| API | `pnpm --filter @filasaude/api dev` | 3000 | PostgreSQL with migrations |
| Web | `pnpm --filter @filasaude/web dev --host 127.0.0.1 --port 5173 --strictPort` | 5173 | API (Vite proxies `/api` to `:3000`) |
| Simulator | `pnpm --filter @filasaude/simulador dev` | — | API healthy and the occupancy routes on |

Do not use the root `pnpm dev`: it starts every app at once, the simulator
asks the API for the unit catalog before the API is up and exits, and none
of the apps gets the variables below.

## 1. Check what is already running

```bash
ss -ltn | grep -E ':(3000|4173|5173|5432) '
docker compose ps   # podman: the CLI is emulated, the output is the same
```

- Port 4173 belongs to Playwright, which reuses a server already there. Never
  start the dev web on 4173.
- The Compose project is named `filasaude` in every checkout and worktree, so
  the PostgreSQL container is shared with the main checkout and other
  sessions. It may have been stopped by someone else: start it again rather
  than creating another one, and never run `docker compose down -v`.

## 2. PostgreSQL and migrations

```bash
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U filasaude; do sleep 1; done
pnpm --filter @filasaude/api migration:run   # builds the API first
```

## 3. Environment (export it in the same shell that starts each app)

Generate a source secret once and keep the JSON outside the repository (for
an agent, in its scratchpad). The secret must have 32 characters or more.

```bash
SECRET="$(openssl rand -hex 32)"
export WEBHOOK_SOURCE_CONFIG="{\"occupancy-feed\":{\"secret\":\"$SECRET\",\"unitCnes\":[\"0004340\",\"0017396\",\"0050571\",\"0466611\",\"0924857\",\"0932280\",\"2339315\",\"6481876\",\"7429398\",\"7458606\"]}}"
```

The CNES list is the demonstration sample (one UPA in each of ten UFs, see
`docs/simulator-testing.md`). Every code must exist in the API catalog, or
the simulator stops with "CNES não encontrado no catálogo".

| Variable | App | Use |
| --- | --- | --- |
| `WEBHOOK_SOURCE_CONFIG` | API and simulator | Source secret and the CNES it may update. The simulator reads its secret and sample from it. |
| `OCCUPANCY_SIMULATION_ENABLED=true` | API | Turns on `GET /occupancy` and `/occupancy/simulation`. Without it they answer 404 and the site hides the layer. |
| `OCCUPANCY_STALE_AFTER_MINUTES` | API | 20 by default. Use 2 or 3 for a demo, so "sem confirmação recente" shows up in minutes. |
| `OCCUPANCY_PROCESSOR_ENABLED=false` | API | Only to run the inbox processor elsewhere. |
| `SIMULATOR_SCENARIO=showcase` | Simulator | Starting scenario. |
| `SIMULATOR_FOLLOW_SITE=true` | Simulator | Plays the scenario chosen on the site. |
| `SIMULATOR_INTERVAL_SECONDS=30` | Simulator | 120 by default; shorter for a demo. |
| `ADMIN_API_TOKENS` | API | Only for `/admin`. |

## 4. Start the apps, in order

Run each one as a background task of the agent harness (not with `setsid` or
`nohup`, which the harness cannot stop or report):

```bash
# API: wait for health before going on
OCCUPANCY_SIMULATION_ENABLED=true OCCUPANCY_STALE_AFTER_MINUTES=3 \
  pnpm --filter @filasaude/api dev
until curl -sf localhost:3000/health >/dev/null; do sleep 1; done

# Web
pnpm --filter @filasaude/web dev --host 127.0.0.1 --port 5173 --strictPort

# Simulator: last, once the API answers
SIMULATOR_SCENARIO=showcase SIMULATOR_FOLLOW_SITE=true SIMULATOR_INTERVAL_SECONDS=30 \
  pnpm --filter @filasaude/simulador dev
```

The simulator exits when the API stays down after its retries (outside
Compose nothing restarts it). If the API restarts, start the simulator again.

## 5. Check that it works

```bash
curl -s localhost:3000/occupancy | grep -o '"unitCnes"' | wc -l   # units with data
curl -s localhost:3000/occupancy/simulation                        # scenario in play
curl -s -X PUT -H 'Content-Type: application/json' \
  -d '{"scenario":"surge"}' localhost:3000/occupancy/simulation     # 429 within 15 s of another change
```

Then open http://127.0.0.1:5173 and turn on "Ocupação simulada". A unit with
the `intermittent` role of the showcase is silent half of every hour, so one
fewer unit than the sample is normal.

To show "sem confirmação recente", choose "Interrupção da fonte" on the site
and wait for the stale limit. Do not insert rows in `occupancy_current` by
hand: they have no history and confuse anyone who reads that database later.

## Alternative: everything in containers

```bash
OCCUPANCY_SIMULATION_ENABLED=true docker compose --profile simulation up --build
```

The web is then on 8080 and the API on 3000. The simulator service waits for
the API health check and restarts on failure.

## 6. Stop and clean up

Stop by port or by the exact process, never with a pattern that also matches
the shell running the command (`pkill -f "node dist/main.js"` inside a
command that contains that text kills the shell itself):

```bash
kill "$(ss -ltnp | grep ':3000 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
kill "$(ss -ltnp | grep ':5173 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
pgrep -f 'experimental-strip-types src/main.ts' | xargs -r kill
```

The demo leaves data in the shared database. Clear only the rows of the demo
source, never whole tables: another session may be using the same database.

```bash
docker compose exec -T postgres psql -U filasaude -c \
  "DELETE FROM occupancy_current WHERE source_id = 'occupancy-feed'; DELETE FROM occupancy_webhook_inbox WHERE source_id = 'occupancy-feed';"
```

`simulation_control` has no source column, so it is left alone: a scenario
chosen on the site expires by itself after 15 minutes and the API then answers
with the default. If the database is yours alone (an isolated Compose project),
you can also `DELETE FROM simulation_control;`.

## Before Playwright

`pnpm playwright test` starts its own Vite on 4173, but that Vite proxies
`/api` to whatever runs on 3000. With the API up and the simulation on, the
layer becomes available inside the tests and the mobile popup test can fail.
Stop the API, or run with the layer available on purpose to check that case.
