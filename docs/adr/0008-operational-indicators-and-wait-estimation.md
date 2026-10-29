# ADR 0008: Indicadores operacionais e estimativa de espera pelo histórico

- Status: aceita
- Data: 2026-10-29
- PR: [#122](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/pull/122)
- Complementa: [ADR 0005](0005-simulated-occupancy-semantics.md) e
  [ADR 0007](0007-attendance-flow-and-color-synthesis.md)

## Contexto

O FilaSaúde já recebe pessoas em espera, pessoas em atendimento, concluídos
por período e ocupação de leitos. A interface precisa reunir cinco indicadores:
pessoas em espera, tempo estimado até o início do atendimento, ocupação,
capacidade instalada e serviços disponíveis.

O simulador faz o papel de um sistema de origem. Calcular a estimativa nele
usando seus parâmetros internos de duração deixaria o FilaSaúde dependente de
uma informação que uma futura fonte pode não enviar. O histórico persistido
permite inferir o ritmo recente sem conhecer esses parâmetros. As contagens
agregadas, porém, não informam quanto cada pessoa esperou individualmente.

## Responsabilidade pela análise e integração com as unidades

A responsabilidade da unidade é informar o estado operacional que seu sistema
conhece: pessoas esperando, pessoas em atendimento, concluídos no período,
postos e recursos disponíveis. Ela envia contagens agregadas pelo contrato,
sem precisar desenvolver um modelo de previsão, guardar um histórico analítico
próprio para esta finalidade ou calcular a espera estimada antes do envio.

A responsabilidade do FilaSaúde é receber e validar essas contagens, persistir
os snapshots, verificar se o histórico permite uma análise e calcular os
indicadores derivados. Isso reduz o trabalho de integração em cada unidade e
permite conectar sistemas de origem diferentes sem exigir que todos
implementem o mesmo algoritmo. O simulador deve exercitar essa mesma fronteira:
gerar os dados de entrada que uma unidade poderia enviar, sem fornecer à API
uma resposta pronta ou parâmetros exclusivos do seu modelo.

Centralizar a análise também mantém uma metodologia comum: o FilaSaúde define
o cálculo, seus critérios de suficiência e seus estados de indisponibilidade.
Uma correção ou evolução desse método pode ser aplicada no consumidor e sobre
o histórico retido, sem obrigar cada unidade a alterar seu sistema de origem,
desde que o contrato das contagens continue suficiente. Método e janela
acompanham o resultado para permitir explicar como ele foi obtido.

A integração continua exigindo o envio das contagens operacionais: o que se
dispensa é o envio de estimativas e análises já calculadas. A centralização da
metodologia não garante, por si só, a qualidade das fontes ou a comparabilidade
clínica de unidades com processos diferentes; esses pontos exigem validação
antes de uma integração real.

## Decisão

1. **A origem envia dados; o FilaSaúde calcula a estimativa.** O simulador
   continua gerando chegadas e conclusões aleatórias, reproduzíveis pela seed.
   As conclusões passam a ter sorteios independentes por atendimento em curso.
   A duração média usada para gerar o fluxo é interna ao modelo e não entra
   no contrato nem no cálculo da API.
2. Estender o v2 com `attendance.installedServiceSlots` e `attendance.services`
   opcionais. Postos instalados são separados de postos ativos e de leitos.
   Serviços descrevem somente a oferta fictícia do cenário. Ausência não é
   zero; uma lista vazia confirma nenhum serviço. Snapshots anteriores
   continuam válidos.
3. Calcular o ritmo de início dos atendimentos por conservação dos estoques:

   ```text
   inícios = diferença dos concluídos + diferença das pessoas em atendimento
   ritmo = inícios / minutos do intervalo
   espera estimada = pessoas esperando agora / ritmo
   ```

   O resultado é arredondado para cima em minutos inteiros. O percentual de
   ocupação dos leitos e os parâmetros do simulador não participam da conta.
4. Usar o segmento contínuo mais recente do histórico processado, com janela,
   quantidade mínima de amostras e tolerância a lacunas definidas no
   [contrato da estimativa](../contracts/wait-estimate-v1.md). Mudança de fonte
   ou período, regressão do contador, inícios negativos e ausência de dados
   interrompem o segmento. Correções no mesmo instante substituem a leitura
   anterior. Não somar snapshots cumulativos nem contar reenvios como amostras
   adicionais.
5. Acrescentar `waitEstimate` às respostas atuais de REST, aos deltas SSE e ao
   estado atual do histórico. A consulta em lote usa o índice existente por
   CNES/ocorrência, tem limite por unidade e se ancora na versão atual já lida:
   um evento posterior não pode entrar na janela dessa resposta.
6. Representar explicitamente falta de dados, histórico insuficiente, ritmo
   nulo e confirmação expirada. Uma fila confirmada em zero só produz zero
   minutos quando há histórico e ritmo válidos. A interface mantém
   compatibilidade com APIs anteriores sem o campo da estimativa.
7. Reunir os cinco indicadores no detalhe. A lista e o popup mostram a espera
   estimada quando disponível; o detalhe explica o método e a janela. Todos
   os dados e estimativas permanecem simulados, com fonte e horário. A nova
   estimativa não altera a cor nem a ordem das unidades.

## Alternativas consideradas

- **Calcular no simulador:** permitiria usar diretamente a duração média do
  perfil, mas esconderia a dependência de um parâmetro que não faz parte dos
  dados recebidos de uma fonte. O cálculo fica no consumidor para depender
  somente do contrato e do histórico.
- **Converter fila por posto ou ocupação em minutos:** esses indicadores,
  isoladamente, não fornecem um ritmo temporal de atendimento.
- **Mostrar uma média de esperas individuais:** exigiria medições próprias
  dessa duração, ausentes no contrato. A interface apresenta uma estimativa
  agregada, sem afirmar que mede essa média.
- **Somar concluídos de todos os snapshots:** duplicaria valores cumulativos.
  A diferença entre leituras compatíveis preserva a semântica do período.

## Consequências e limites

A API faz uma leitura adicional limitada do histórico por conjunto de
unidades. Não há consulta individual feita pela aplicação para cada CNES,
nova variável de ambiente nem migração: os recursos adicionais usam o JSONB
existente. A API deve ser atualizada antes do simulador, pois a validação antiga
rejeita os novos campos opcionais.

A estimativa pressupõe continuidade do ritmo recente. Não é duração de consulta,
média medida de esperas individuais, previsão de demanda ou garantia para uma
pessoa. Não incorpora prioridades clínicas. Reinícios sem regressão observável
dos contadores podem não ser detectados; cadências muito altas podem encurtar a
janela limitada até torná-la insuficiente. Esses limites devem continuar
explícitos no contrato e no guia.

Enquanto os dados de entrada forem fictícios, a estimativa também é simulada.
Uma integração real exigirá validar a semântica das contagens e a qualidade da
estimativa; esta decisão não autoriza apresentar os dados sintéticos como reais
nem recomendar estabelecimentos.

## Evidências

- [Contrato do snapshot v2](../contracts/occupancy-snapshot-v2.md) e
  [contrato da estimativa](../contracts/wait-estimate-v1.md).
- [Cálculo](../../apps/api/src/occupancy/wait-estimate.ts),
  [testes do cálculo](../../apps/api/src/occupancy/wait-estimate.spec.ts) e
  [consulta do histórico](../../apps/api/src/database/repositories/occupancy.repository.ts).
- [Sorteios do simulador](../../apps/simulador/src/attendance.ts) e
  [testes dos estoques e recursos](../../apps/simulador/test/attendance.test.ts).
- [Detalhe dos indicadores](../../apps/web/src/UnitOccupancySection.tsx),
  [testes da interface](../../e2e/occupancy-layer.spec.ts) e
  [guia de uso](../guia-filasaude.md#os-cinco-indicadores-operacionais).
