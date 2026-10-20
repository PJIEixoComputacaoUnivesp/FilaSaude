# ADR 0005: Semântica da demonstração de ocupação de leitos

- Status: aceita (registro da implementação existente)
- Data do registro: 2026-10-17
- Origem: [proposta 0001](../proposals/0001-operational-occupancy-simulation.md)

## Contexto

O cadastro CNES não fornece a ocupação operacional em tempo real usada pela
demonstração. A interface precisa distinguir dados cadastrais públicos de
valores sintéticos e não pode transformar ocupação em recomendação médica.

## Decisão

Simular capacidades e quantidades ocupadas de observação, estabilização e
internação, de forma reproduzível por seed. A geração é nacional, com agenda
independente dos visitantes. O total é a soma dos ocupados dividida pela soma
das capacidades informadas, não uma média simples dos percentuais.

Usar faixas convencionais da demonstração: abaixo de 60%, de 60% até menos de
85% e a partir de 85%. Classificar pela proporção antes do arredondamento.
Capacidade total zero é “não informado”. Confirmação vencida conserva o número
mas retira a faixa de ocupação. Limites e janelas configuráveis ficam na
[referência](../behavior-reference.md), não duplicados como constantes nesta ADR.

A camada começa desligada sem escolha prévia; ativação é por sessão do
navegador. Todas as respostas operacionais indicam simulação. Cadastro, fonte
e data de atualização continuam separados da origem e dos horários do snapshot.

## Alternativas e consequências

Exibir média simples daria peso igual a categorias com capacidades diferentes;
o agregado implementado usa capacidade como peso. Exibir ausência como zero
ou manter a cor após perda de confirmação produziria uma interpretação errada
da disponibilidade. As faixas escolhidas não constituem padrões clínicos.

O percentual não mede fila, pessoas atendidas ou tempo de espera. A seed não
modela demanda real, sazonalidade ou inventário de cada unidade. Evoluir para
essas métricas exige contratos e decisões próprios, sem reinterpretar o campo
atual. Arredondamento pode fazer o percentual exibido coincidir com um limiar
enquanto a proporção ainda está na faixa inferior.

## Evidências

- [Contrato de snapshot](../contracts/occupancy-snapshot-v1.md)
- [Geração determinística](../../apps/simulador/README.md#como-a-seed-gera-a-ocupação)
- [Cálculo e confirmação](../../apps/api/src/occupancy/occupancy-status.ts)
- [Estado da camada](../../apps/web/src/OccupancyLayerProvider.tsx)
