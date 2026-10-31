# Atualizações de ocupação por SSE

Implementa o item SSE da [issue #78](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/78)
e o consumo em tempo real da [#79](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/79),
integrados na PR #104 sobre o gerador nacional da PR #105.

## Conexão e eventos

`GET /occupancy/stream` responde com `text/event-stream` e `X-Accel-Buffering: no`.
Sem `OCCUPANCY_SIMULATION_ENABLED=true`, responde 404, como as consultas REST.
As mensagens têm `id` crescente no processo da API e `retry: 2000`.

- `ready`: conexão iniciada, com `simulated: true` e horário do servidor.
- `occupancy.updated`: resposta parcial no mesmo formato de `GET /occupancy`,
  contendo somente as unidades dos eventos processados. Inclui metadados de
  simulação, fonte, atualização, faixas e prazo de confirmação.
- `heartbeat`: mantém a conexão ativa a cada 15 segundos, sem consultar o banco.
- `unavailable`: o canal de notificações está indisponível; o cliente mantém os
  últimos dados e indica a tentativa de recuperação.
- `resync`: a conexão da API com o canal do banco foi restabelecida; refazer o
  snapshot REST recupera mudanças ocorridas durante a interrupção.

Exemplo de sinal de conexão:

```text
id: 1792170000000001
event: ready
retry: 2000
data: {"simulated":true,"serverTime":"2026-10-16T20:00:00.000Z"}

```

O evento de atualização tem `data: {"data":[...],"metadata":{...}}`. Com o
snapshot v2, cada item traz também `attendance`, `indicators` e `levelDrivers`,
como em `GET /occupancy`. Os itens
usam os campos do contrato REST de ocupação; o cliente substitui as unidades
pelo CNES e preserva o restante do catálogo. Não há um GET nacional por evento.

## Consistência e recuperação

O processador executa `pg_notify` para os CNES processados na mesma transação
que atualiza a projeção e marca a inbox. PostgreSQL só entrega a notificação
após commit. Cada mensagem do banco contém apenas um CNES, evitando o limite de
payload de NOTIFY mesmo com lotes grandes. Eventos atrasados também notificam,
pois alteram o histórico sem substituir a projeção mais recente.

Cada instância da API reserva uma conexão do pool para LISTEN quando a camada
pública está habilitada. Os navegadores compartilham esse listener; nenhuma
conexão de banco é reservada por visitante. As notificações são agrupadas por
100 ms, e as unidades afetadas são consultadas uma vez por lote, compartilhando
o resultado entre os assinantes. Sem assinantes não são feitas essas consultas.
Isso funciona também quando outro worker ou instância processa os eventos.

O stream não guarda um log para replay. Os IDs identificam e ordenam mensagens
do processo atual; não são cursores duráveis entre reinícios ou réplicas.
`GET /occupancy/availability` diz se a camada existe, sem ler dados: responde
`{ "simulated": true }`, ou 404 com a demonstração desligada. O cliente a consulta
para oferecer o botão e só abre o stream com a camada ligada.

O cliente refaz `GET /occupancy` em toda abertura/reconexão e ao receber `resync`,
sem depender de `Last-Event-ID`. Deltas recebidos durante esse GET são agrupados
e aplicados depois do snapshot, evitando que uma resposta lenta apague dados novos.

Desligar a camada ou ocultar a aba fecha a conexão. Ao reabrir, o snapshot é
reconstruído. Não há polling de ocupação nem de histórico. O detalhe refaz o
histórico apenas quando seu CNES recebe um delta ou após uma ressincronização,
com uma única requisição em andamento e agrupamento de notificações concorrentes.
A expiração visual da confirmação é calculada localmente a cada 15 segundos,
sem requisições, inclusive quando a fonte ou o stream ficam sem enviar dados.

## Proxy e validação

O Nginx desliga buffering e cache especificamente nessa rota, usa HTTP/1.1 e
aceita 75 segundos sem leitura; os heartbeats mantêm a conexão ativa.
O proxy Caddy encaminha o tipo `text/event-stream` em fluxo.

Validar ausência de GETs nacionais repetidos após a carga inicial, deltas de
unidades de UFs distintas, reconexão, atualização do histórico sem substituir
um estado mais novo por evento atrasado, fechamento ao desligar a camada e
expiração sem eventos novos. Os dados continuam sintéticos e identificados como tal.
