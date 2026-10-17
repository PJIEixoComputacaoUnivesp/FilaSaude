# ADR 0004: Inbox PostgreSQL e projeção assíncrona de ocupação

- Status: aceita (registro da implementação existente)
- Data do registro: 2026-10-17
- Complementa: [ADR 0003](0003-occupancy-server-sent-events.md)

## Contexto

O webhook precisa confirmar recebimento persistido sem executar toda a projeção
na requisição. Retentativas podem duplicar eventos e entregas podem chegar fora
de ordem. A infraestrutura atual já depende de PostgreSQL.

## Decisão

Persistir o evento na inbox antes de responder `202`. Processar em segundo plano
dentro da API, com timer configurável, sem sobrepor ticks no mesmo processo.
A inbox armazena também os eventos usados pelo histórico; `occupancy_current`
é uma projeção do estado mais novo por CNES.

Trabalhadores concorrentes usam `FOR UPDATE SKIP LOCKED`. A projeção só avança
pela ordem de `occurredAt`, `observedAt`, `receivedAt` e `eventId`. Eventos
atrasados são processados e preservados no histórico sem regredir o estado.
Marcação, projeção e notificação são transacionais. Falhas de lote são isoladas
por evento; erros de dados/integridade podem terminar em `failed`, enquanto
falhas transitórias permanecem pendentes.

## Alternativas e consequências

Processar na requisição acoplaria sua latência à projeção. Um broker dedicado
exigiria outro serviço; a implementação atual usa a inbox PostgreSQL. Estas
são alternativas para comparação, não um relato de avaliações históricas.

`202` não garante processamento concluído; operações precisam medir backlog e
falhas. Não há replay automático de `failed` nem garantia permanente de
idempotência após a limpeza da inbox. Retenção é seletiva e não limpa o estado
atual. Separar o worker em outro processo exigirá desativar o timer onde não
deve trabalhar e definir seu ciclo de vida.

Reavaliar esta decisão se drenagem, retenção ou isolamento da API não atenderem
à carga, ou se for necessário replay durável independente do histórico público.

## Evidências e parâmetros

- [Processador](../../apps/api/src/occupancy/occupancy-processor.service.ts)
- [Persistência transacional](../../apps/api/src/database/repositories/occupancy.repository.ts)
- [Regras e limites](../behavior-reference.md#processamento-e-persistência)
- [Diagnóstico e recuperação](../operations.md)
