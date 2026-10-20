# Operação e diagnóstico dos fluxos

Este runbook complementa o [deploy](deployment.md), o [fluxo](architecture-flow.md)
e a [referência de regras](behavior-reference.md). Os comandos abaixo são para
o diretório da stack, com o Compose e as credenciais já configurados; não
imprimem o `.env`. Eles também podem ser usados na stack local com o arquivo
Compose correspondente.

## Localizar a etapa que parou

| Sintoma | Conferência |
| --- | --- |
| Webhook sem `202` | Logs do simulador/API; status HTTP e contrato: autenticação, CNES autorizado, limite, corpo e disponibilidade do banco |
| `202`, mas tela não muda | Quantidade/idade de `pending`, processador habilitado, logs de lote e `failed` |
| Banco atualizado, navegador parado | Exposição pública, camada ativa, aba visível, REST e eventos SSE; conferir proxy e reconexão |
| Valor presente sem cor | `observedAt` vencido ou capacidade não informada; verificar metadados antes de concluir perda de dados |
| Cadastro antigo após ingestão | Resultado por UF, cache da API e cache do navegador; atualização não é distribuída por SSE cadastral |

O relatório do simulador mede envio/aceitação HTTP, não processamento ou
renderização. `202` não prova que o evento foi projetado. Da mesma forma,
`GET /health` usa a resposta estática do serviço de saúde da API; não consulta
a inbox, não mede backlog e não comprova saúde de ponta a ponta.

```sh
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs --since 30m --tail 200 api simulator
```

## Medir a fila e a projeção

Abrir uma sessão de leitura no PostgreSQL do Compose:

```sh
docker compose -f compose.prod.yaml exec postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Executar nessa sessão:

```sql
SELECT status, count(*) AS events, min(received_at) AS oldest_received,
       max(received_at) AS newest_received
FROM occupancy_webhook_inbox
GROUP BY status;

SELECT count(*) AS pending,
       now() - min(received_at) AS oldest_pending_age
FROM occupancy_webhook_inbox
WHERE status = 'pending';

SELECT event_id, unit_cnes, received_at, processed_at, processing_error
FROM occupancy_webhook_inbox
WHERE status = 'failed'
ORDER BY processed_at DESC
LIMIT 20;

SELECT unit_cnes, event_id, occurred_at, observed_at, received_at, updated_at
FROM occupancy_current
WHERE unit_cnes = '5567335';
```

Comparar amostras ao longo do tempo: crescimento contínuo de pendentes e idade
crescente indicam que a drenagem não acompanha a entrada. `processed` pode
incluir eventos atrasados que não alteraram `occupancy_current`; não é erro por
si só. Os horários têm significados diferentes, conforme a referência.

## Eventos com falha

Falhas transitórias permanecem pendentes e são tentadas em ticks posteriores.
Restabelecer o banco ou corrigir a causa antes de reiniciar repetidamente a API.
Eventos `failed` não são tentados automaticamente. Reenviar o mesmo corpo com
o mesmo ID recebe `202` por duplicidade e não muda esse status.

Não existe CLI ou endpoint de reprocessamento nesta entrega. Para um `failed`,
registrar ID, motivo e causa, corrigir o problema e definir uma recuperação
supervisionada. Um novo snapshot pode restabelecer o estado atual, mas não
recupera a transição histórica perdida. Alterar manualmente o status exige
análise específica da causa e dos dados; este runbook não automatiza essa ação.

## Interromper a carga e preservar evidências

Para interromper somente a geração:

```sh
docker compose -f compose.prod.yaml stop -t 60 simulator
```

O sinal solicita cancelamento; requisições em andamento podem ser abortadas.
O runner nacional aguarda o encerramento dessas tarefas e emite relatório final.
O processador da API continua drenando a fila. Para retomar o serviço já criado:

```sh
docker compose -f compose.prod.yaml --profile simulation start simulator
```

Retomar um processo reinicia seu estado em memória e sua sequência, não continua
do último valor. Desligar a camada no navegador ou a flag pública da API não
interrompe a geração. Desligar o processador com a geração ativa aumenta a fila.

Guardar relatório, logs relevantes e agregados necessários ao experimento antes
da retenção removê-los. O backup e a restauração estão no
[guia de deploy](deployment.md#backups). `pending` e `failed` não são removidos
pela limpeza atual; monitorar seu crescimento separadamente. A limpeza pode
remover IDs antigos: não usar reenvio histórico como teste permanente de
idempotência após retenção.

## Conexões PostgreSQL

O Compose configura `max_connections=10`. O datasource não define um limite
explícito de pool; dimensionar a configuração efetiva do driver antes de alterar
réplicas ou carga. O listener SSE reserva uma conexão **do pool da API**, não
uma conexão por visitante, mesmo quando não há assinantes se a flag pública
estiver ligada. Ingestão CLI, migrations, backup e consultas operacionais abrem
suas próprias sessões.

```sql
SHOW max_connections;
SHOW superuser_reserved_connections;
SELECT backend_type, application_name, state, count(*) AS connections
FROM pg_stat_activity
GROUP BY backend_type, application_name, state
ORDER BY connections DESC;
```

O orçamento deve considerar sessões simultâneas de todas as instâncias,
conexões reservadas e margem operacional. O listener ocupa uma vaga dentro do
pool; não somá-lo novamente fora desse pool. Evitar sobrepor ingestão e
migrations a um incidente de saturação. `53300`/`too many clients already`
indica recusa por limite de conexões, não prova perda de eventos persistidos.

## Rotinas e publicação

Ingestão semanal e backup diário precisam de cron configurado no servidor;
versionar um script não instala seu agendamento. Conferir os horários e destinos
em [deploy](deployment.md#ingestão-semanal-do-cnes). Os arquivos locais não
versionados de métricas/healthcheck não constituem parte do procedimento
reproduzível publicado por este guia.

Push executa CI, mas não publica produção. O workflow manual valida commit na
`main` e CI, prepara imagens e executa deploy/checagem pública/confirmação.
Rollback troca imagens e não desfaz migrations; seguir o
[procedimento de publicação](deployment.md#4-publicação-e-rollback).
