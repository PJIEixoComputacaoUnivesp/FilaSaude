# ADR 0001: Fonte pública de unidades de urgência

- Status: aceita
- Data: 2026-09-24
- Issue: [#21](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/21)

## Contexto

O FilaSaúde precisa apresentar informações cadastrais de unidades públicas de
pronto atendimento e pronto-socorro em todo o Brasil. A fonte precisa oferecer
cobertura nacional, identificador estável, endereço, localização, tipo do
estabelecimento e data de atualização.

O consumo da fonte não deve ocorrer durante uma requisição do usuário. A coleta
envolve paginação, validação e normalização suficientes para tornar esse fluxo
lento e dependente da disponibilidade de um serviço externo.

## Fontes avaliadas

### Cadastro Nacional de Estabelecimentos de Saúde (CNES)

O Portal de Dados Abertos do SUS disponibiliza o cadastro nacional em API e em
arquivos JSON/XML. O conjunto tem cobertura nacional, identificador CNES,
endereço, coordenadas, tipo de unidade, vínculo com o SUS e data de atualização.
O portal informa frequência de atualização diária.

Vantagens:

- fonte oficial do Ministério da Saúde;
- cobertura nacional e granularidade por estabelecimento;
- código CNES estável para identificação e atualização idempotente;
- tipos oficiais para pronto-socorro geral (`20`), pronto-socorro especializado
  (`21`) e pronto atendimento (`73`);
- API com filtros por UF, tipo, situação e paginação.

Limitações:

- dados são informados por gestores locais e podem conter campos ausentes ou
  inconsistentes, inclusive coordenadas;
- a API paginada pode ficar lenta ou indisponível;
- o código do município precisa ser traduzido para um nome legível.

### Conjunto “Hospitais e Leitos”

Possui dados hospitalares e de leitos, mas seu recorte não representa todas as
unidades de pronto atendimento e inclui hospitais sem garantia de serviço de
urgência. Não será usado para determinar o escopo das unidades.

### Conjunto “UPA 24h em funcionamento”

É específico para UPA e distingue habilitação para custeio, mas não cobre
pronto-socorros gerais e especializados. Pode ser usado futuramente para
enriquecimento, não como cadastro principal.

### Rede Nacional de Dados em Saúde (RNDS)

A RNDS é uma plataforma de interoperabilidade clínica, não um catálogo público
adequado ao fluxo informativo deste produto. Não será utilizada.

## Decisão

Usar o endpoint oficial `GET /cnes/estabelecimentos` como fonte cadastral e
coletar somente estabelecimentos:

- ativos (`status=1`, filtro da API);
- dos tipos CNES `20`, `21` e `73` (`codigo_tipo_unidade`, filtro da API, com
  uma consulta por tipo);
- vinculados ao atendimento ambulatorial SUS. A API não oferece esse filtro, então
  a regra é aplicada localmente: somente registros com
  `estabelecimento_faz_atendimento_ambulatorial_sus` igual a `"SIM"` são
  mantidos.

A paginação envia sempre `limit=20` explicitamente. O Swagger declara `100` como
padrão, mas também diz que o valor deve ser menor ou igual a 20. Em testes feitos
em 2026-09-24, `offset` se comportou como índice do primeiro registro, e não como
número da página descrito no Swagger: `offset=1` desloca a lista em um registro.
Por isso, as páginas são requisitadas com `offset` igual a 0, 20, 40 e assim por
diante, até que uma página retorne menos de 20 registros.

Usar a API de Localidades do IBGE para associar o código municipal do CNES ao
nome oficial do município e à sigla da UF.

A coleta será executada por um job separado da API HTTP. O job fará a ingestão
por UF, com paginação limitada, tentativas com espera progressiva e atualização
idempotente no PostgreSQL pelo código CNES. Uma falha em uma UF não apagará a
última versão válida já armazenada.

O job será executado diariamente, após a janela esperada de atualização da
fonte. Reexecuções manuais e a ingestão de uma única UF também serão suportadas.

### Atualidade dos dados

No portal, os metadados do recurso "API CNES" indicam atualização em
2024-12-20, enquanto os arquivos do conjunto indicam 2026-09-02. Por isso, a
atualidade foi verificada nos próprios registros: em 2026-09-24, as 456 unidades
de SP retornadas pela API tinham `data_atualizacao` entre 2025-09-03 e
2026-09-22. A API continua sendo atualizada e é mantida como fonte.

A data exibida para cada unidade é o campo `data_atualizacao` do registro, e não
a data dos metadados do portal. O job deve registrar a data mais recente
recebida por UF e alertar quando ela deixar de avançar por mais de 30 dias. Esse
sinal indica que a API pode ter sido descontinuada e que é preciso avaliar os
arquivos do conjunto como alternativa.

### Implementação transitória

A primeira entrega (PR #36) ainda não tem PostgreSQL nem job. Nela, a API
consulta o CNES durante a requisição, com cache em memória de seis horas por UF.
Se a consulta falhar, ela usa a última resposta válida marcada como
desatualizada e, para SP, um snapshot incorporado. Essa abordagem é temporária e
será substituída pela ingestão descrita acima nas issues #22 e #23.

## Dados persistidos

Para cada unidade serão mantidos, no mínimo:

- código CNES;
- nome e tipo oficial da unidade;
- logradouro, número, bairro, CEP, município e UF;
- latitude e longitude, quando válidas;
- horário informado pela fonte, quando disponível;
- URL e nome da fonte;
- data de atualização do registro na fonte;
- data da última ingestão pelo FilaSaúde.

Campos ausentes permanecerão nulos. Coordenadas inválidas não serão corrigidas
por inferência; serão rejeitadas ou sinalizadas para não produzir localização
enganosa.

## Exibição e transparência

Cada unidade exibida deve apresentar “Cadastro Nacional de Estabelecimentos de
Saúde (CNES)” como fonte e a data de atualização informada pelo registro. A
interface deve indicar quando estiver exibindo uma versão anterior por falha de
atualização, sem sugerir disponibilidade, adequação clínica ou recomendação.

## Licença e referências

O Portal de Dados Abertos do SUS declara seu conteúdo sob Creative Commons
Atribuição-SemDerivações 3.0 (CC BY-ND 3.0). A licença permite redistribuir o
material, mas não distribuir adaptações.

O FilaSaúde trata assim as operações aplicadas aos dados:

- **Não alteram o conteúdo:** selecionar registros e campos, validar tipos,
  converter formato (JSON para tabela e resposta da API) e trocar o código IBGE
  do município pelo nome oficial fornecido pelo próprio IBGE. Os valores dos
  campos exibidos são os da fonte.
- **Não são feitas:** corrigir, completar ou inferir endereços, coordenadas,
  horários ou nomes. Um valor inválido é descartado (exibido como ausente), não
  substituído por outro.

Qualquer transformação que altere o conteúdo de um campo da fonte só pode ser
adotada depois de confirmar uma autorização compatível; até lá, esse dado não
deve ser distribuído. Essa classificação é um entendimento do grupo, não um
parecer jurídico, e deve ser revisada se o uso do produto sair do contexto
acadêmico.

A atribuição exibida junto aos dados inclui:

- o nome "Cadastro Nacional de Estabelecimentos de Saúde (CNES)" e o
  Ministério da Saúde como titular;
- link para o conjunto no Portal de Dados Abertos do SUS;
- nome e link da licença CC BY-ND 3.0;
- a data de atualização do registro e o aviso de que os dados são informativos
  e podem estar desatualizados.

- [API de Dados Abertos do Ministério da Saúde](https://apidadosabertos.saude.gov.br/)
- [Swagger da API](https://apidadosabertos.saude.gov.br/static/swagger.json)
- [Conjunto CNES no Portal de Dados Abertos do SUS](https://dadosabertos.saude.gov.br/dataset/cnes-cadastro-nacional-de-estabelecimentos-de-saude)
- [API de Localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades)
- [Licença CC BY-ND 3.0](https://creativecommons.org/licenses/by-nd/3.0/deed.pt-br)

## Consequências

- requisições de usuários consultarão somente o banco local;
- a disponibilidade do CNES afetará a atualização, não a leitura dos dados já
  ingeridos;
- PostgreSQL e uma rotina agendada passam a ser dependências do produto;
- a qualidade de endereço e localização continuará limitada pela qualidade do
  cadastro oficial e deverá ser tratada explicitamente.
