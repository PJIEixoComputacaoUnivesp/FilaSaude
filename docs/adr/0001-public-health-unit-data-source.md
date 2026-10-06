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
desatualizada e, na falta dela, o snapshot incorporado da UF. O mesmo snapshot
atende sozinho a visão nacional (`ALL` e `BR`), sem consultar o CNES. Essa
abordagem é temporária e será substituída pela ingestão descrita acima nas
issues #22 e #23.

## Dados persistidos

Para cada unidade serão mantidos, no mínimo:

- código CNES;
- nome e tipo oficial da unidade;
- logradouro, número, bairro, CEP, município e UF;
- latitude e longitude, quando válidas;
- correções manuais de posição, em tabela própria (ver "Correção manual por
  administradores");
- horário informado pela fonte, quando disponível;
- URL e nome da fonte;
- data de atualização do registro na fonte;
- data da última ingestão pelo FilaSaúde.

Campos ausentes permanecerão nulos. Coordenadas inválidas não serão corrigidas
por inferência silenciosa; toda posição que não vem do CNES é sinalizada para
não produzir localização enganosa.

### Coordenadas fora do município

O CNES é autodeclarado e algumas coordenadas apontam para fora do município
declarado. Em 2026-10-06, 73 das 1.793 unidades estavam fora do contorno e 34
(cerca de 1,9%) a mais de 5 km dele. Nenhuma unidade é removida por isso. A API
compara a coordenada com o contorno do município no IBGE (malhas v3, qualidade
mínima, em cache por UF) com tolerância de 5 km, porque o contorno é
simplificado. Quando a coordenada está fora, ou ausente, a posição é escolhida
nesta ordem, e `location.precision` informa qual foi usada:

1. posição definida por um administrador (`manual`), sempre que existir, mesmo
   sobre uma coordenada do CNES que esteja dentro do município (ver
   "Correção manual por administradores");
2. dentro do município ou da tolerância: a coordenada atual do CNES (`source`);
3. o último ponto do histórico mensal do CNES que esteja dentro do município e
   tenha sido registrado para o mesmo endereço (`history`), com a competência
   em `location.referenceMonth`;
4. geocodificação pelo endereço (`geocoded`, ainda não implementada);
5. o centro do município calculado do contorno do IBGE (`municipality`).

Em todos os casos diferentes de `source`, a coordenada informada pelo CNES fica
em `location.original` e a unidade é registrada no log. A interface mostra um
aviso no popup e, para `municipality`, um marcador vazado com o texto
“localização aproximada: centro do município”.

#### Histórico mensal do CNES

O endpoint `GET /assistencia-a-saude/cnes-estabelecimentos` guarda uma linha por
estabelecimento e por competência mensal (2008 a 2026-07 na medição). O erro
costuma ser uma edição recente: a UPA Bruno Covas tinha a coordenada correta até
2025-11 e passou ao erro de 1,0 grau em 2025-12. Um ponto do próprio CNES, de
uma competência anterior, é mais fiel à fonte do que o centro do município.

A regra de “mesmo endereço” exige logradouro e número iguais aos atuais,
ignorando maiúsculas, acentos, pontuação e CEP (o CNES refina o CEP sem que a
unidade mude de lugar). “S/N”, “SN” e número ausente são equivalentes, e “01”
equivale a “1”. Sem logradouro não há correspondência.

Não há limite de idade para o ponto. A primeira proposta era 24 meses, mas a
idade não mede mudança de endereço: na medição, 3 das 11 unidades recuperáveis
dentro de 24 meses tinham outro endereço hoje, enquanto vários pontos mais
antigos pertencem ao mesmo endereço. A igualdade do endereço foi adotada no
lugar do limite, e a competência é sempre exibida. Na medição de 2026-10-06, das
34 unidades a mais de 5 km, 18 foram recuperadas pelo histórico e 16 ficaram no
centro do município.

Cuidados com esse endpoint:

- consultar com o código CNES de 7 dígitos, com zero à esquerda: `0113360`
  encontra a unidade e `113360` não retorna nada;
- a API ignora filtros que não conhece, então cada linha é conferida contra o
  código pedido;
- `offset` é o índice do registro, como no endpoint de estabelecimentos, e
  `limit` aceita até 1000;
- a competência mais recente pode estar um mês atrás de
  `/cnes/estabelecimentos`, que é atualizado diariamente.

Limitações: “dentro do município” é a única verificação geométrica, e um ponto
do mesmo endereço também é autodeclarado, então não prova que a posição esteja
certa. Enquanto a ingestão não existe (ver “Implementação transitória”), o
histórico é consultado durante a requisição, só para as unidades com coordenada
inválida, com um prazo único de 10 s para a fase, concorrência 5 e cache de
24 h das linhas por unidade. Se falhar, a unidade cai no centro do município e a
resposta é reavaliada em 1 hora (em 5 minutos quando o contorno do IBGE é que
falhou). Essa consulta passa para o job de ingestão (#23).

Município sem contorno no IBGE: a malha tem 5.570 municípios e não inclui os
criados mais recentemente, como Boa Esperança do Norte (MT, 5101837). Para
essas unidades não há como validar a coordenada, que permanece a do CNES, e o
fato é registrado no log. Em 2026-10-06 era o caso de 1 unidade.

Junto de uma posição `history`, a interface mostra a competência de origem do
ponto, além da `data_atualizacao` do registro atual, que continua sendo a data
do cadastro exibido.

A visão nacional, servida pelo snapshot, passa pela mesma verificação, inclusive
pelo histórico. O fallback por UF, que só ocorre quando o CNES está fora do ar,
não consulta o histórico, pois ele estaria indisponível também.

A geocodificação pelo endereço (`geocoded`) será adicionada com o job de
ingestão e, quando existir, também será identificada na interface.

#### Correção manual por administradores

Um administrador pode definir a posição de uma unidade em tempo de execução,
sem novo deploy, pela página `/admin` do site (fora do menu) ou pelos endpoints
`GET /admin/me`, `GET /admin/location-corrections`,
`GET /admin/location-corrections/:cnesCode/events` e
`PUT`/`DELETE /admin/location-corrections/:cnesCode`. As correções ficam na
tabela `unit_location_corrections` (migração, entidade e repositório no padrão
do #70), e não em `health_units`, porque a ingestão diária reescreve as
coordenadas dessa tabela pelo código CNES.

- **Quem é administrador:** quem tem um token em `ADMIN_API_TOKENS`, uma lista
  de entradas `login:token`, uma por pessoa, enviado como
  `Authorization: Bearer`. O login é o do GitHub. Há um único nível de acesso e
  nenhuma rota ou tela que crie, altere ou remova administradores: eles existem
  só por esse secret, o que evita o risco de vários níveis de administrador em
  que um nível baixo mexa nas credenciais de um alto. O projeto não tem contas de
  usuário nem coleta dados pessoais, e contas seriam desproporcionais para esta
  função. A comparação usa `timingSafeEqual` sobre digests SHA-256 contra todas
  as entradas, sem sair no primeiro acerto, e o token nunca vai para log ou
  resposta.
- **Identidade e revogação:** quem fez cada alteração vem do token, e não de um
  campo que o chamador escreve, então ninguém atribui uma correção a outra
  pessoa. Revogar alguém é remover a entrada do secret e fazer um novo deploy, e
  a lista é o inventário de quem tem acesso. A rotação de um token também exige
  trocar o secret e fazer um novo deploy.
- **Interruptor:** sem uma lista válida configurada, as rotas não existem (404).
  Uma entrada malformada (sem login, token com menos de 32 caracteres ou com
  `:`, login ou token repetido) mantém todas as rotas desligadas, e o log
  aponta a posição da entrada e nunca o valor. A função fica desligada até
  alguém criar o secret de propósito. O grupo confirma o uso de posições que não
  vêm do CNES caso a caso, no momento em que um administrador faz cada correção
  (ver "Licença e referências").
- **Tentativas inválidas:** mais de 20 falhas em 10 minutos, numa janela global
  que dispensa o endereço do cliente (atrás de um proxy ele não é confiável),
  fazem as tentativas inválidas seguintes receberem 429. Um token válido nunca
  é contado nem bloqueado, então não há como travar um administrador de
  propósito. Por isso o limite **sinaliza** o abuso, mas não impede adivinhar:
  quem acertasse um token continuaria passando. A proteção contra adivinhação é
  o tamanho e a aleatoriedade dos tokens (256 bits com `openssl rand -hex 32`).
  O limitador guarda no máximo 20 falhas, para que uma enxurrada de tokens
  inválidos não cresça a memória. As falhas vão ao log de forma agregada, sem o
  token, e não ao banco, para que ninguém o encha com tentativas.
- **Validação na borda:** o código CNES tem 1 a 7 dígitos; a posição precisa
  estar no Brasil e dentro do município da unidade, com a mesma tolerância de
  5 km das demais checagens; `method` (até 500 caracteres, com quebras de linha
  permitidas) é obrigatório. A
  unidade é consultada no CNES na hora e precisa ser uma das listadas pelo
  produto. Para um município sem contorno no IBGE a posição não pode ser
  conferida, e o administrador é confiado.
- **Auditoria:** cada definição, substituição e remoção grava quem fez, quando,
  o método e a posição anterior e a nova, na tabela
  `unit_location_correction_events`, na mesma transação da mudança. A tabela só
  recebe inserções, e o repositório não tem um caminho que altere uma correção
  sem registrá-la, então uma remoção também deixa rastro. A leitura da linha
  atual vem depois de um lock advisory por unidade (`pg_advisory_xact_lock`), e
  não de um lock de linha, que não segura nada quando a unidade ainda não tem
  correção. Em 320 primeiras escritas simultâneas, o lock de linha falhou em 273
  por violação da chave primária, e o lock advisory em nenhuma. O cache só é
  invalidado depois do commit, e só o da UF da unidade e o da visão nacional,
  pois refazer uma UF no CNES leva dezenas de segundos. As entradas são
  descartadas, e não mantidas como reserva: se o CNES estiver fora do ar logo
  depois de uma remoção, o snapshot embutido passa pelas correções atuais, e uma
  resposta antiga continuaria mostrando a posição removida. A auditoria é
  ordenada pelo id, que é atribuído dentro do lock da unidade.
- **Âncora:** a correção guarda o município, o logradouro, o número e a
  coordenada que o CNES tinha quando ela foi feita. Se o município ou o
  endereço mudarem, a unidade pode ter se mudado e a correção deixa de valer,
  com aviso no log. Se só a coordenada mudou, a correção continua valendo e o
  fato vai para o log, para revisão: o administrador escolheu sobrepor o CNES,
  e a coordenada pode ter sido corrigida ou apenas alterada. A visão nacional
  vem do snapshot, que pode estar atrás do CNES, então uma correção feita
  contra um endereço mais novo pode ficar de fora dela até o snapshot ser
  atualizado.
- **O que é público:** a resposta traz `precision: "manual"` e `correctedAt`
  (data no fuso de Brasília), e a coordenada do CNES em `location.original`.
  Quem verificou e como ficam só na visão do administrador. As respostas de
  administração pedem `Cache-Control: no-store`.
- **Cache e falhas:** cada escrita invalida o cache das unidades, inclusive as
  cargas em andamento, para que a correção apareça na hora. Se o banco falhar
  depois de a API subir, a camada é pulada, a resposta pública continua e é
  reavaliada em 5 minutos. A API não sobe sem o banco, o que já era assim desde
  o #70.
- **A página:** o token fica só na memória da aba (nunca em `localStorage`,
  cookie ou URL) e é pedido de novo ao recarregar; a página usa `noindex`. Um
  mapa permite marcar a posição com um clique, e os campos de latitude e
  longitude continuam como caminho por teclado, pois clicar num mapa não o é.
  As mensagens de erro são em português e nunca repetem o texto da API.
- **Limitações:** a segurança depende de tokens aleatórios longos
  (`openssl rand -hex 32`), entregues só a cada pessoa, e do HTTPS do Caddy. Não
  há bloqueio por pessoa nem alerta além do log agregado, e não há segundo
  administrador que aprove uma correção.

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
- **Substituem uma coordenada inválida, sempre com aviso:** usar outro valor do
  próprio CNES, de uma competência anterior e para o mesmo endereço (`history`),
  e usar o centro do município calculado do contorno do IBGE (`municipality`).
  O primeiro é um valor da fonte sem alteração; o segundo não vem do CNES. Nos
  dois, a coordenada informada é preservada em `location.original`. O
  `municipality` foi adotado na Etapa 1 por ser sempre sinalizado e preservar o
  original, mas, por não vir do CNES, essa classificação precisa ser confirmada
  pelo grupo junto com a de `manual` e `geocoded`.
- **Não são feitas:** corrigir, completar ou inferir endereços, horários ou
  nomes, nem trocar uma coordenada sem sinalizar. A correção manual e a
  geocodificação (`manual` e `geocoded`) criam valores que não são do CNES e só
  entram depois de confirmar uma autorização compatível, como descrito abaixo.
  O `manual` já está implementado, mas permanece inativo em produção enquanto o
  secret `ADMIN_API_TOKENS` não for criado. O grupo confirma o uso dessas
  posições caso a caso, no momento em que um administrador faz cada correção,
  por ser um trabalho manual, e cada uma fica registrada com quem a fez.

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
- [API de malhas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)
- [Histórico mensal de estabelecimentos (`/assistencia-a-saude/cnes-estabelecimentos`)](https://apidadosabertos.saude.gov.br/static/swagger.json)
- [Licença CC BY-ND 3.0](https://creativecommons.org/licenses/by-nd/3.0/deed.pt-br)

## Consequências

- requisições de usuários consultarão somente o banco local;
- a disponibilidade do CNES afetará a atualização, não a leitura dos dados já
  ingeridos;
- PostgreSQL e uma rotina agendada passam a ser dependências do produto;
- a qualidade de endereço e localização continuará limitada pela qualidade do
  cadastro oficial e deverá ser tratada explicitamente.
