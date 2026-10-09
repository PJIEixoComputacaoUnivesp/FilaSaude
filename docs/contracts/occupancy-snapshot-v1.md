# Contrato `occupancy.snapshot.v1`

Este documento define o payload enviado pelo simulador e recebido pela API no
endpoint `POST /webhooks/v1/occupancy`. O schema normativo está em
[`occupancy-snapshot-v1.schema.json`](./occupancy-snapshot-v1.schema.json).

Cada requisição representa uma única unidade CNES. O snapshot é completo para o
estado enviado pela origem, mas pode conter somente as categorias aplicáveis ou
informadas para aquela unidade. Uma categoria ausente não representa ocupação
zero.

## Cabeçalhos

| Cabeçalho | Regra |
| --- | --- |
| `Content-Type` | Deve ser `application/json`. |
| `X-Webhook-Source` | Identificador da fonte autorizada. |
| `X-Webhook-Timestamp` | Unix timestamp em segundos. |
| `X-Webhook-Signature` | `sha256=<HMAC hexadecimal>`. |

A assinatura é calculada sobre os bytes exatos do corpo HTTP:

```text
HMAC-SHA256(sourceSecret, timestamp + "." + rawBody)
```

### Vetor de assinatura

Este vetor usa um segredo exclusivamente documental e um corpo compacto. Ele
permite conferir a implementação do HMAC antes de usar um segredo real:

| Campo | Valor |
| --- | --- |
| `sourceSecret` | `test-secret-for-occupancy-vector-2026` |
| `timestamp` | `1790000000` |
| `rawBody` | `{"eventId":"01K5T2S6C4TZ1K9TR6F89A2M7X","type":"occupancy.snapshot.v1","unitCnes":"1234567","occurredAt":"2026-09-25T14:30:00Z","observedAt":"2026-09-25T14:30:05Z","categories":[{"code":"observation","capacity":20,"occupied":13}]}` |
| `X-Webhook-Signature` | `sha256=da56c33183345cfa94a63775704a2b52655350b77dae47c84a836db888cc62e5` |

O corpo deve ser usado exatamente como está na tabela, sem espaços ou quebras
de linha adicionais.

O simulador deve serializar o JSON uma única vez, assinar os mesmos bytes que
serão enviados e gerar um novo timestamp e assinatura em cada retentativa. O
`eventId` permanece igual nas retentativas.

## Regras semânticas

- `eventId` é um ULID e identifica o evento de forma idempotente.
- `type` deve ser exatamente `occupancy.snapshot.v1`.
- `unitCnes` deve conter sete dígitos.
- Os códigos permitidos são `observation`, `stabilization` e `inpatient`.
- `capacity` e `occupied` são inteiros não negativos.
- `occupied` não pode ser maior que `capacity`.
- Cada código de categoria pode aparecer uma única vez.
- `occurredAt` e `observedAt` usam ISO 8601; `occurredAt` deve ser anterior ou
  igual a `observedAt`.
- Campos desconhecidos são rejeitados.

O schema valida a estrutura e os tipos básicos. As relações entre timestamps,
`occupied` e `capacity`, além da unicidade dos códigos, também devem ser
validadas pela aplicação.

## Exemplo válido

```json
{
  "eventId": "01K5T2S6C4TZ1K9TR6F89A2M7X",
  "type": "occupancy.snapshot.v1",
  "unitCnes": "1234567",
  "occurredAt": "2026-09-25T14:30:00-03:00",
  "observedAt": "2026-09-25T14:30:05-03:00",
  "categories": [
    {
      "code": "observation",
      "capacity": 20,
      "occupied": 13
    },
    {
      "code": "stabilization",
      "capacity": 4,
      "occupied": 2
    },
    {
      "code": "inpatient",
      "capacity": 8,
      "occupied": 5
    }
  ]
}
```

## Idempotência e erros

Uma nova ocorrência com o mesmo `eventId` e o mesmo corpo é considerada
recebida e responde `202 Accepted` sem criar outra entrada na inbox. O mesmo
`eventId` associado a um corpo diferente responde `409 Conflict`.

Erros de requisição usam uma resposta estruturada com código estável, mensagem
curta e, quando necessário, campos inválidos. A resposta nunca inclui segredos,
assinaturas completas ou detalhes internos.

| Situação | Resposta |
| --- | --- |
| Requisição válida ou duplicidade idêntica | `202 Accepted` |
| Corpo malformado ou contrato inválido | `400 Bad Request` ou `422 Unprocessable Entity` |
| Cabeçalho ou assinatura inválida/expirada | `401 Unauthorized` |
| Fonte sem acesso ao CNES informado | `403 Forbidden` |
| Corpo acima do limite | `413 Payload Too Large` |
| `Content-Type` inválido | `415 Unsupported Media Type` |
| `eventId` com corpo diferente | `409 Conflict` |
| Falha transitória da API | `5xx` |

O corpo máximo é de 64 KB, a tolerância do timestamp é de cinco minutos e o
limite inicial é de 60 requisições por minuto por fonte.
