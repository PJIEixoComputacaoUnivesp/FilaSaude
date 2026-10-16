---
name: run-local-stack
description: Iniciar, verificar e encerrar PostgreSQL, API, web e fontes nacionais sintéticas do FilaSaúde na ordem correta. Use para subir a stack local ou validar a integração da ocupação nacional com o site.
---

# Stack local com ocupação nacional

A geração nacional da PR #105 alimenta o processamento e a interface da PR #104.
Os eventos continuam chegando de todo o catálogo, independentemente de visitas,
localização, UF, busca ou interruptor da camada. O site oferece consultas; não
há seletor público de cenários nem `/occupancy/simulation`.

As instruções do usuário prevalecem sobre este procedimento. Não leia nem copie
`deploy/.env`. Não use `pnpm dev` da raiz: ele inicia o simulador antes da API e
sem a configuração necessária. Nenhum processo lê o `.env` automaticamente.

## 1. Verificar os serviços

```bash
ss -ltn | grep -E ':(3000|4173|5173|5432) '
docker compose ps
```

A porta 4173 é do Playwright. Use 5173 para a interface de desenvolvimento.
O projeto Compose `filasaude` e seu PostgreSQL podem estar sendo usados por
outras sessões. Não execute `docker compose down -v` nem apague tabelas inteiras.

## 2. PostgreSQL e migrations

```bash
docker compose up -d postgres
pnpm --filter @filasaude/api migration:run
```

A API fora do Docker usa `DB_HOST=localhost`, `DB_PORT=5432`, `DB_NAME=filasaude`,
`DB_USER=filasaude` e `DB_PASSWORD=filasaude` no ambiente padrão de desenvolvimento.
Exporte os valores se o banco local for diferente.

## 3. Configurar as fontes nacionais

Use 24 fontes para o catálogo de 1.793 unidades e cadência média de 120 segundos.
Mantenha a mesma seed e a mesma ordem de IDs ao gerar a autorização e executar o
simulador. A quantidade de fontes precisa ser reavaliada se a cadência ou o
catálogo mudar: a API limita requisições por fonte.

O exemplo abaixo usa o snapshot embarcado. Se o banco tiver um catálogo mais
recente, salve primeiro a resposta pública de `GET /units?state=ALL` em um arquivo
temporário e exporte `SIMULATOR_CATALOG_FILE` com esse caminho. Não use uma lista
recortada pela UF do visitante. Reinicie a API depois de atualizar a configuração.

```bash
export SIMULATOR_SOURCE_SECRET="$(openssl rand -hex 32)"
export SIMULATOR_SEED=fila-saude-v1
export SIMULATOR_SOURCE_IDS="$(node -p 'Array.from({length:24},(_,i)=>`occupancy-feed-${String(i+1).padStart(3,"0")}`).join(",")')"
export WEBHOOK_SOURCE_CONFIG="$(node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const catalog = JSON.parse(readFileSync(
  process.env.SIMULATOR_CATALOG_FILE || 'apps/api/src/units/units.snapshot.json', 'utf8'));
const units = Array.isArray(catalog) ? catalog : catalog.data;
const ids = process.env.SIMULATOR_SOURCE_IDS.split(',');
const config = Object.fromEntries(ids.map(id => [id, {
  secret: process.env.SIMULATOR_SOURCE_SECRET, unitCnes: [],
}]));
for (const unit of units) {
  const index = createHash('sha256').update(`${process.env.SIMULATOR_SEED}:${unit.id}`)
    .digest().readUInt32BE(0) % ids.length;
  config[ids[index]].unitCnes.push(unit.id);
}
process.stdout.write(JSON.stringify(config));
JS
)"
# O simulador pode ler todos os segredos do mesmo JSON da API.
unset SIMULATOR_SOURCE_SECRET
export OCCUPANCY_SIMULATION_ENABLED=true
```

Não imprima nem versione `WEBHOOK_SOURCE_CONFIG`: ele contém os segredos. Cada
processo precisa receber esse JSON e a lista `SIMULATOR_SOURCE_IDS`. Segredos por
fonte também são aceitos. A lista de CNES autoriza os envios; não substitui a
consulta nacional feita pelo gerador.

## 4. Iniciar em ordem

Execute cada processo em uma tarefa de background controlada pelo harness e
aguarde a saúde da API antes do simulador. Evite `nohup` e `setsid`.

```bash
pnpm --filter @filasaude/api dev
# Em outra tarefa, com o mesmo ambiente:
curl --fail http://127.0.0.1:3000/health
pnpm --filter @filasaude/web dev --host 127.0.0.1 --port 5173 --strictPort
# Em outra tarefa, com o mesmo ambiente:
pnpm --filter @filasaude/simulador dev --scenario national --duration-seconds 0 --allow-load-test
```

Com as mesmas variáveis, a alternativa em contêineres é:

```bash
docker compose --profile simulation up --build
```

No Compose, a interface fica em 8080 e a API em 3000. O simulador aguarda a saúde
da API e roda continuamente. O destino interno e a carga nacional são autorizados
explicitamente no serviço. Fora do Compose, acompanhe os relatórios de falhas e
encerre a tarefa quando terminar a validação.

## 5. Validar a independência da visualização

- Aguarde os primeiros eventos; o primeiro envio de cada unidade é distribuído
  no tempo. Confira `GET /occupancy` e o histórico por CNES.
- Ligue a camada no site e alterne entre UFs, mapa, lista e detalhe. Dados,
  fonte, atualização e marca de simulação devem permanecer coerentes.
- Desligue a camada ou feche o navegador e confira que os eventos continuam
  chegando e sendo processados. O processador é independente da flag pública;
  `OCCUPANCY_PROCESSOR_ENABLED=false` só serve para execução por outro worker.
- Para testar ausência de confirmação, pare uma fonte em ambiente isolado e
  aguarde `OCCUPANCY_STALE_AFTER_MINUTES` (20 por padrão). Não escreva projeções
  artificiais em `occupancy_current`.
- As métricas do gerador confirmam o aceite na inbox. Verifique também a projeção
  e a interface; saúde da API ou HTTP 202 não comprovam essa segunda etapa.

## 6. Encerrar e limpar

Encerre apenas as tarefas iniciadas pela sessão pelo identificador do harness.
Se precisar limpar, remova somente as linhas dos IDs de fonte criados por esta
sessão em `occupancy_current` e `occupancy_webhook_inbox`, com lista explícita e
confirmada. Não use prefixos amplos que possam incluir fontes de outras sessões.
Não pare nem limpe o PostgreSQL compartilhado.

## Playwright

`pnpm playwright test` inicia seu Vite em 4173 e pode reaproveitar um servidor
existente fora da CI. Verifique a porta para evitar validar outra worktree.
Os testes da camada simulam a API. Para inspeção visual de mudanças, confira
larguras de celular e desktop; não é necessário iniciar carga nacional para
validar alterações puramente visuais.
