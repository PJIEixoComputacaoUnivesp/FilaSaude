# ADR 0009: Leitura enxuta da espera e comparação com o habitual

- Status: aceita
- Data: 2026-10-31
- Complementa: [ADR 0008](0008-operational-indicators-and-wait-estimation.md)

## Contexto

O botão "Ocupação simulada" só aparecia depois que `GET /occupancy` respondia.
Em produção, em 31/10/2026, essa rota levou de 14 a 19 segundos, contra 0,4 s de
`GET /health`. A resposta tinha 1,6 MB (144 KB comprimidos), então o tempo não
vinha do tamanho: quase tudo passava antes do primeiro byte.

A causa era a leitura da estimativa na inbox. Com 1.790 unidades e um envio a
cada 2 minutos, cada resposta nacional lia cerca de 53.700 linhas. As linhas de
uma unidade ficam espalhadas pelos 4,7 GB da tabela, pois os envios de todas as
unidades são intercalados, e cada uma custa uma leitura aleatória. O
`EXPLAIN (ANALYZE, BUFFERS)` de 100 unidades mostrou 3.505 páginas lidas do disco
em 1,45 s, com `shared_buffers` de 32 MB e contêiner limitado a 192 MB. Todo
visitante pagava esse custo, mesmo sem ligar a camada, e quem ligava pagava duas
vezes, porque a abertura do SSE refazia a carga.

Havia também o pedido de indicar quando a espera está mais alta que o normal. A
retenção de produção é de 48 horas e o cenário `normal` do simulador não tem
padrão por hora do dia. Na amostra de 150 unidades e 48 horas, 60% das
estimativas eram 0 min, a mediana era 0, o p75 era 15 e o p95 era 80.

## Decisão

1. **Disponibilidade separada dos dados.** `GET /occupancy/availability`
   responde sem consultar o banco, com 404 quando a demonstração está desligada.
   O site oferece o botão a partir dela e só carrega o retrato nacional com a
   camada ligada, uma vez, na abertura do SSE. Se o SSE não conectar, o primeiro
   retrato ainda é carregado.
2. **Estimativa lida de uma tabela enxuta.** `occupancy_flow_sample` guarda só
   as contagens de fluxo da janela recente, gravadas na mesma instrução que
   processa o evento e envia a notificação. A tabela é apagada a cada 15 minutos
   e cabe na memória. O método, os limites e o resultado do
   [contrato da estimativa](../contracts/wait-estimate-v1.md) não mudam. A
   migration copia a janela recente. A API antiga não grava na tabela, então
   uma troca de mais de 10 minutos interrompe a série, e a estimativa volta
   sozinha no primeiro envio após 15 minutos de envios contínuos.
3. **Leituras a cada 15 minutos.** A API registra em `occupancy_wait_sample` a
   estimativa de cada unidade, sem depender de visitantes, e resume as últimas
   24 horas em `occupancy_wait_baseline`. Ler o resumo custa uma linha por
   unidade. Usa o mesmo `estimateWait`, sem segunda implementação do cálculo.
4. **Cada unidade é comparada só consigo mesma.** A espera está acima do
   habitual quando é maior que o percentil 90 da unidade **e** ao menos 15
   minutos maior que a mediana. São exigidas 48 leituras, ou seja, 12 horas, e um
   resumo atualizado na última hora. Sem isso, não há comparação.
5. **O resultado é descritivo.** `waitComparison` acompanha a resposta, não muda
   cor, classificação nem ordem, e a interface não sugere nenhuma ação. Só o
   caso "acima do habitual" aparece nos resumos; o detalhe mostra a comparação e
   explica o período e as leituras usadas.

## Alternativas consideradas

- **Cache em memória de `GET /occupancy`:** a primeira leitura e cada renovação
  ainda fariam toda a consulta na inbox, e os deltas do SSE não melhorariam.
- **Calcular a estimativa no processamento:** faria uma leitura na inbox para
  cada evento recebido, cerca de 15 por segundo, além de obrigar a separar o
  `pg_notify` da instrução que processa o lote.
- **Aumentar a memória do PostgreSQL:** alivia, mas mantém 53.700 linhas por
  requisição crescendo com o catálogo.
- **Comparar com a mesma hora de outros dias:** com 48 horas de retenção restam
  uma ou duas amostras, e o simulador não tem padrão diário.
- **Comparar com outras unidades:** seria lido como recomendação de onde ir.
- **Só o percentil, sem margem:** com a maioria das leituras em zero, poucos
  minutos de fila bastariam para marcar a unidade.

## Consequências e limites

Com o volume nacional em uma base local com os limites de memória de produção,
`GET /occupancy` respondeu em cerca de 0,27 s e a disponibilidade em 1 ms. A
tabela enxuta ocupa cerca de 30 MB para 90 minutos. O cálculo em produção ainda
precisa ser conferido depois do deploy.

O simulador não tem padrão diário, então "acima do habitual" reflete sobretudo
variação aleatória, e a regra marca cerca de 11% das leituras da amostra. Uma
fonte real com pico diário exigiria comparar por horário: uma linha de base de
24 horas marcaria todo pico como incomum. Isso precisa ser revisto antes de
qualquer integração real, com a validação já exigida no ADR 0008.

Depois do deploy, a comparação leva 12 horas para aparecer, pois as leituras
começam do zero. Até lá, o detalhe informa que a comparação está indisponível.
Uma leitura que falha não é repetida: a próxima vem no intervalo seguinte.
Limpar a inbox de uma rodada deve limpar também as três tabelas novas.

As leituras e o resumo são por unidade, sem fonte, enquanto a estimativa
interrompe a série quando a fonte muda. Se uma unidade trocar de fonte, a nova
é comparada por até 24 horas com as leituras da anterior. Hoje cada unidade tem
uma fonte fixa; isso precisa mudar antes de haver várias fontes por unidade.

## Evidências

- [Comparação](../../apps/api/src/occupancy/wait-comparison.ts) e
  [leituras periódicas](../../apps/api/src/occupancy/occupancy-wait-baseline.service.ts).
- [Consultas](../../apps/api/src/database/repositories/occupancy.repository.ts) e
  [migration](../../apps/api/src/database/migrations/1765000000000-CreateOccupancyWaitTables.ts).
- [Contrato da estimativa](../contracts/wait-estimate-v1.md) e
  [contrato do stream](../contracts/occupancy-stream-v1.md).
