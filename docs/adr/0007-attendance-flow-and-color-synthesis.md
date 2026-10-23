# ADR 0007: Fluxo de atendimento simulado e síntese da cor

- Status: aceita
- Data: 2026-10-23
- Issues: #107, #108, #109 e #110
- Complementa: [ADR 0005](0005-simulated-occupancy-semantics.md)

## Contexto

A ideia original da camada era mostrar a situação geral de cada unidade, mas a
entrega da ADR 0005 representa só leitos sintéticos. Faltavam pessoas
esperando, pessoas em atendimento e atendimentos concluídos, e uma regra para
combinar esses dados em uma única cor sem transformar contagens em percentual
de capacidade.

## Decisão

1. O simulador modela cada unidade como estados com transições explícitas:
   chegada → espera → em atendimento → saída. Em cada passo, conclusões, depois
   chegadas (Poisson), depois inícios limitados aos postos ativos. A fila não
   tem teto. Perfis sintéticos (`small`, `medium`, `large`) vêm do hash da seed
   e do CNES, e não da quantidade de leitos.
2. O contrato [`occupancy.snapshot.v2`](../contracts/occupancy-snapshot-v2.md)
   acrescenta `attendance` opcional, no mesmo endpoint. O v1 continua aceito.
   `serviceSlots` informa os postos ativos e serve de referência para a espera.
3. Concluídos são um total cumulativo por período explícito e semiaberto (dia de
   Brasília, `-03:00`). O consumidor substitui o valor pelo do snapshot mais
   recente e nunca soma, o que torna reenvios e retentativas idempotentes.
4. A cor do mapa é a **faixa mais alta** entre leitos (limiares da ADR 0005) e
   espera por posto (baixa < 1, moderada de 1 a < 3, alta ≥ 3). Concluídos
   nunca entram na cor. A API devolve `indicators` e `levelDrivers`, e a
   interface diz qual indicador definiu a cor. Não existe percentual de
   “ocupação geral”.
5. As faixas usam verde, amarelo e vermelho com anel escuro, por escolha do
   grupo, substituindo a escala violeta. Como são as cores da classificação de
   risco, a cor nunca aparece sozinha: o texto diz “situação simulada”, a faixa
   e o indicador, e a legenda avisa que não é classificação de risco nem ordem
   de atendimento.

## Alternativas e consequências

Manter a cor só pelos leitos seria mais simples, mas não mostraria a situação
geral. Usar média ponderada entre indicadores exigiria pesos sem base. A pior
faixa é fácil de explicar e de verificar, mas uma unidade com leitos livres e
fila longa aparece como alta.

Os limiares de espera e os perfis são hipóteses da demonstração, não padrões
operacionais. A escolha de verde, amarelo e vermelho aumenta o risco de leitura
como triagem; o texto obrigatório e o aviso da legenda reduzem esse risco, sem
eliminá-lo. Calibração com dados reais fica como trabalho futuro.

O estado do simulador é mantido em memória. Reiniciar repete a sequência pela
seed e recomeça o total do dia. A API substitui o valor e não soma.

## Evidências

- [Modelo do fluxo](../../apps/simulador/src/attendance.ts) e
  [README do simulador](../../apps/simulador/README.md#fluxo-de-atendimento-sintético)
- [Validação do v2](../../apps/api/src/webhooks/occupancy-snapshot-validation.service.ts)
- [Síntese](../../apps/api/src/occupancy/occupancy-status.ts)
- [Cores e textos](../../apps/web/src/occupancy.ts)
