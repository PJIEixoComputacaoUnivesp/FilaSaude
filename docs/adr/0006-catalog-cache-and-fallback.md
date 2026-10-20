# ADR 0006: Cache e contingência do catálogo cadastral

- Status: aceita (registro da implementação existente)
- Data do registro: 2026-10-17
- Complementa: [ADR 0001](0001-public-health-unit-data-source.md)

## Contexto

O catálogo é ingerido separadamente. A leitura ainda pode depender de
enriquecimentos externos e precisa continuar útil quando o banco ou as fontes
de localização falham, sem ocultar procedência ou defasagem.

## Decisão

Manter cache em memória por UF e visão nacional na API, compartilhando cargas
concorrentes da mesma chave. Ajustar o TTL conforme a validação geográfica e a
completude do histórico. Na falha, reutilizar a última resposta válida marcada
como desatualizada; sem ela, usar o snapshot incorporado com identificação de
contingência. A visão nacional requer todas as UFs no banco.

Correções manuais invalidam a UF e a visão nacional na instância que atende à
escrita. Uma geração por chave impede que cargas iniciadas antes da invalidação
recoloquem resultados antigos no cache. O navegador mantém outro cache por UF,
limpo por retry ou alterações feitas na sua interface administrativa.

## Alternativas e consequências

Consultar fontes em toda leitura aumentaria latência e dependência externa.
Cache distribuído e invalidação por mensagens poderiam melhorar consistência
entre réplicas, mas não fazem parte da implementação atual.

O cache não é uma fonte persistente nem distribuída. Ingestão separada não
invalida APIs já em execução; o cache do navegador não tem TTL explícito nem
revalidação automática. Correções feitas por outro navegador ou outra instância
podem demorar a aparecer. SSE de ocupação não atualiza o cadastro.

Reavaliar ao exigir propagação imediata de correções ou operar várias réplicas.
TTLs e caminhos de contingência estão na [referência](../behavior-reference.md#navegação-e-cache-cadastral).

## Evidências

- [Serviço cadastral](../../apps/api/src/units/units.service.ts)
- [Correções](../../apps/api/src/units/location-corrections.service.ts)
- [Cache do navegador](../../apps/web/src/useUnits.ts)
