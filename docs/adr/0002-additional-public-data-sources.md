# ADR 0002: Fontes públicas adicionais para unidades de urgência

- Status: aceita
- Data: 2026-10-06
- Issue: [#30](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/30)

## Contexto

O cadastro principal do FilaSaúde vem do CNES. Uma fonte adicional pode
melhorar a localização ou permitir a comparação dos dados, mas não deve criar
uma associação incerta entre estabelecimentos nem ocultar a procedência de um
campo.

Foram avaliados o conjunto nacional de UPA 24h em funcionamento, o GeoSampa,
Hospitais e Leitos, a RNDS e o OpenStreetMap.

## Fontes selecionadas

### UPA 24h em funcionamento (MGDI)

O Ministério da Saúde publica mensalmente um arquivo JSON compactado em ZIP com
o total de UPAs em funcionamento. A granularidade é municipal: cada registro
tem competência, código IBGE do município e total calculado, mas não identifica
as unidades por CNES.

Por isso, o conjunto será usado apenas para validação agregada futura. Ele não
é combinado aos registros da API e não determina se uma unidade individual
está ativa. Em especial, seu total não deve ser comparado diretamente à soma de
prontos-socorros e prontos atendimentos do CNES, pois os recortes são distintos.

O Portal de Dados Abertos do SUS declara a licença Creative Commons
Atribuição-SemDerivações 3.0 (CC BY-ND 3.0). Na avaliação de 2026-10-06, o
arquivo continha competência `202607` e campos de atualização da fonte.

### GeoSampa — Urgência / Emergência

A Prefeitura de São Paulo publica a camada municipal de unidades de urgência e
emergência por WFS, em formatos como GeoJSON, GML e CSV. O catálogo informa
atualização anual, série histórica desde 2004 e exposição da versão mais
recente no GeoSampa. Na avaliação de 2026-10-06, a camada continha 53 registros.

A camada não expõe o código CNES. O cruzamento é, portanto, restrito às unidades
do município de São Paulo e só é aceito quando há um único candidato que
atenda a uma destas regras:

- nome normalizado idêntico e CEP idêntico ou distância de até 1 km; ou
- similaridade de ao menos 50% entre os termos do nome e CEP idêntico ou
  distância de até 100 m.

A normalização remove acentos, pontuação e diferenças entre maiúsculas e
minúsculas. Um resultado com mais de um candidato é descartado, assim como uma
feição do GeoSampa que corresponda a mais de um registro CNES. O GeoSampa
fornece apenas as coordenadas; nome, tipo, endereço, horário e identificador
continuam vindo do CNES. Se o WFS estiver indisponível ou retornar dados
inválidos, a resposta mantém integralmente os dados do CNES.

Cada unidade informa `sources`. A lista associa explicitamente os campos à
fonte original: `location` passa a indicar GeoSampa somente nos registros
cruzados; os demais campos continuam atribuídos ao CNES. O GeoSampa não fornece
data de atualização por registro, portanto esse valor permanece nulo, sem
inferência a partir da data de consulta.

Os dados geoespaciais produzidos pela Prefeitura de São Paulo são publicados
sob Creative Commons Atribuição-CompartilhaIgual 4.0 (CC BY-SA 4.0). A
interface mantém a atribuição e o link da fonte junto de cada unidade.

## Fontes não selecionadas

- **Hospitais e Leitos:** também deriva do CNES e inclui hospitais sem garantia
  de atendimento de urgência.
- **RNDS:** é uma rede de interoperabilidade clínica, não um catálogo público
  de estabelecimentos para este produto.
- **OpenStreetMap:** aceita `ref:CNES`, mas parte relevante dos registros de
  saúde brasileiros veio de uma importação única do próprio CNES e não há
  garantia de cobertura ou atualização nacional.

## Referências

- [UPA 24h em funcionamento](https://dadosabertos.saude.gov.br/dataset/mgdi-unidade-de-pronto-atendimento-upa-24h)
- [Catálogo de saúde do GeoSampa](https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/search?topicCat=health)
- [WFS do GeoSampa](https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs)
- [Licença para uso de dados do GeoSampa](https://prefeitura.sp.gov.br/web/licenciamento/w/licen%C3%A7a-para-uso-de-dados-do-geosampa)
- [Hospitais e Leitos](https://dadosabertos.saude.gov.br/dataset/hospitais-e-leitos)
- [Rede Nacional de Dados em Saúde](https://www.gov.br/saude/pt-br/composicao/seidigi/rnds)
- [Importação brasileira do CNES no OpenStreetMap](https://wiki.openstreetmap.org/wiki/Import_of_the_Brazilian_National_Register_of_Health_Facilities)

## Consequências

- a localização de parte das unidades da capital paulista passa a vir de uma
  fonte municipal explicitamente identificada;
- divergências ou associações ambíguas não são resolvidas automaticamente;
- a indisponibilidade do GeoSampa não impede a consulta ao CNES;
- o conjunto MGDI fica documentado para uma futura rotina de qualidade, sem ser
  apresentado como dado por estabelecimento.
