# Estimativa de espera calculada pelo FilaSaúde

`GET /occupancy`, os deltas SSE e `data.current` do histórico incluem
`waitEstimate`, calculado pela API a partir dos snapshots persistidos. O
simulador envia contagens, nunca esse resultado ou seus parâmetros internos.

## Método e significado

Na última hora do instante atual da unidade, considera-se o segmento contínuo
mais recente com `inService` e `completed`. São necessários ao menos três
instantes distintos cobrindo 15 minutos, sem intervalos maiores que 10 minutos.
A leitura é limitada a 121 eventos recentes por unidade, em uma consulta para o
conjunto de unidades solicitado. Ela usa a tabela enxuta `occupancy_flow_sample`,
não a inbox ([ADR 0009](../adr/0009-wait-read-model-and-usual-comparison.md)).
Cadências muito altas podem encurtar a janela a ponto de impedir a estimativa.

```text
inícios no intervalo = diferença dos concluídos + diferença das pessoas em atendimento
ritmo recente       = inícios / minutos do intervalo
espera estimada      = pessoas esperando agora / ritmo recente
```

O resultado é arredondado para cima em minutos inteiros. É uma aproximação
agregada da espera até o início do atendimento sob o ritmo recente, não uma
média observada de tempos individuais, duração de consulta ou garantia para
uma pessoa. Mudanças de fluxo e prioridades clínicas não são previstas.
Leitos, perfil e duração média interna do simulador não entram no cálculo.

Reenvios não somam contagens. Correções do mesmo instante substituem a leitura
anterior. Mudança de fonte/período, regressão do contador, ausência de dados,
inícios negativos ou lacuna de mais de 10 minutos interrompem o segmento.
Os limites do período são comparados como instantes: representações
equivalentes em UTC (`Z`) ou com deslocamento, como `-03:00`, não interrompem
a série. O cálculo retoma quando o novo segmento tem dados suficientes. Reinícios que
não produzam regressão observável do contador não podem ser detectados por
contagens agregadas; a estimativa continua sendo aproximada.

## Resposta disponível

```json
{
  "status": "available",
  "minutes": 20,
  "method": "recent-start-rate",
  "sampleCount": 3,
  "started": 6,
  "windowStart": "2026-10-29T12:00:00.000Z",
  "windowEnd": "2026-10-29T12:20:00.000Z"
}
```

Nesse exemplo, seis pessoas esperam e seis atendimentos começaram em 20 minutos.
Fila confirmada em zero resulta em zero minutos somente com ritmo válido.

## Comparação com o habitual

`waitComparison` acompanha `waitEstimate` nas mesmas respostas e compara a
unidade apenas com as próprias leituras das últimas 24 horas, registradas a cada
15 minutos, sem visitantes:

```json
{
  "status": "above-usual",
  "typicalMinutes": 5,
  "upperMinutes": 30,
  "sampleCount": 96,
  "windowStart": "2026-10-28T12:15:00.000Z",
  "windowEnd": "2026-10-29T12:00:00.000Z"
}
```

`typicalMinutes` é a mediana e `upperMinutes`, o percentil 90. O `status` é
`above-usual` quando a estimativa é maior que o percentil 90 e ao menos 15
minutos maior que a mediana; caso contrário, é `usual`. Sem estimativa disponível,
sem 48 leituras ou sem resumo atualizado na última hora, a resposta é
`{ "status": "unavailable" }`. A ausência do campo em uma API antiga significa
não comparado.

A comparação descreve a leitura simulada. Não prevê a espera, não compara
unidades entre si e não altera cor, classificação ou ordenação.

## Indisponibilidade

`{ "status": "unavailable", "reason": "…" }`, com uma das razões:

| Razão | Significado |
| --- | --- |
| `missing-data` | Contagens necessárias ausentes. |
| `insufficient-history` | Poucos envios ou janela curta após uma interrupção. |
| `no-throughput` | Nenhum início inferido no intervalo; não dividir por zero. |
| `stale` | A confirmação expirou segundo o limite configurado na API. |

A ausência do campo em uma API antiga significa não informado. As respostas
continuam com `metadata.simulated: true`; a interface apresenta a estimativa
como simulada, mostra janela e método no detalhe e a retira dos resumos quando
a confirmação expira. Ela não altera cores, classificação ou ordenação.
