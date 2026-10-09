# Pesquisa: visão geral do levantamento

- **Status:** em andamento (registro de situação, não de decisão)
- **Data:** 2026-10-08
- **Público da revisão:** equipe do projeto FilaSaúde e orientação acadêmica
- **Uso esperado:** saber onde a pesquisa está, o que já se pode afirmar, o que
  falta e quais decisões dependem do grupo
- **Referências relacionadas:** [proposta 0001](../proposals/0001-operational-occupancy-simulation.md),
  [ADR 0001](../adr/0001-public-health-unit-data-source.md),
  [ADR 0002](../adr/0002-additional-public-data-sources.md) e as issues [#19](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/19),
  [#30](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/30), [#33](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/33), [#57](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/57) e [#60](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/60) a [#68](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/68)

> Este documento resume o estado da pesquisa do grupo. Ele não aprova nada: as
> decisões continuam em aberto até o grupo se manifestar nas issues e nas
> propostas.
>
> Os materiais brutos (PDFs, capturas de tela e respostas de pedidos de acesso à
> informação) **não são versionados**, porque trazem dados pessoais e conteúdo
> de terceiros. Aqui entram só descrições com palavras próprias e números
> agregados.

## 1. Situação em uma tabela

| Frente | Issues | Situação | O que existe | O que falta |
| --- | --- | --- | --- | --- |
| Portais municipais de espera e medicamentos | [#60](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/60), [#63](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/63) | Parcial | Portais de oito municípios paulistas conferidos em duas rodadas (29/09 e 01/10/2026); rascunho de comparação de escopo, ainda sem PR | Confirmar termos de uso no texto integral, decidir cada recurso, fechar dúvidas marcadas "a verificar" |
| Meu SUS Digital e e-SaúdeSP | [#61](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/61), [#66](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/66) | Material fora do repositório | Resumo do grupo e conferência parcial em páginas oficiais | Fontes com data de acesso, dados públicos versus dados que exigem login |
| Listas de medicamentos (RENAME e Farmácia Popular) | [#62](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/62), [#65](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/65) | Material fora do repositório | Arquivos do grupo, sem referência oficial | Edição, data, licença e versão estruturada da lista da Farmácia Popular |
| Escopo de medicamentos | [#64](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/64) | Em aberto | Pontos de decisão descritos na issue | Decisão do grupo e da orientação acadêmica |
| Pedidos de acesso à informação (LAI) | sem issue | Duas respostas recebidas | São Paulo e Mogi das Cruzes (seção 4) | Issue própria para registrar o que foi obtido e como usar |
| Municípios para amostra e parceria | [#67](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/67), [#19](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/19) | Só insumos | Contato identificado em Mogi das Cruzes; municípios com painel público | Tabela de municípios e aprovação da abordagem pelo grupo, seguindo o protocolo de consentimento ([#20](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/20)) antes de qualquer contato |
| Referencial dos relatórios | [#68](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/68) | Não iniciada | Este resumo e a comparação de escopo ([#63](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/63)) | Seção de soluções semelhantes, com fontes no formato da disciplina |

## 2. O que os portais municipais de saúde publicam

Vários municípios paulistas mantêm portais de saúde com serviços ao cidadão,
alguns com aplicativo próprio. O que cada um publica varia. Na conferência de
01/10/2026 em cinco municípios (Barueri, Guarulhos, Osasco, Santo André e Mauá),
o que se viu foi:

- **Painel de espera em urgência:** os cinco municípios tinham o painel. Nos
  portais examinados em detalhe (Santo André e, na rodada de 29/09, São
  Vicente), ele mostra, por unidade e por fluxo (adulto e infantil), o tempo
  estimado de espera e o número de pessoas na fila para cada faixa de
  classificação de risco. A atualização é automática, a cada 5 minutos, com data
  e hora da última atualização.
- **Busca de medicamentos por unidade:** onde o resultado carregou (Santo
  André), ela retorna unidade, endereço, telefone, medicamento com dosagem e
  quantidade disponível, com a data do saldo e o aviso de que ele muda durante o
  período. A divulgação tem base na Lei nº 14.654/2023. Em dois dos cinco
  municípios (Barueri e Osasco) a busca não retornava resultado no dia da
  conferência.
- **Outros serviços:** agendamento, histórico de atendimentos, vacinas, laudos e
  teleconsulta. Alguns itens apareciam como indisponíveis. Só Osasco listava um
  serviço chamado "Fila de espera", que não foi aberto: não se sabe se é de
  consultas, exames ou outra coisa, e ele não se confunde com o painel de espera
  da urgência.
- **Faixas de cor:** variam entre municípios. Um deles não usa a faixa vermelha e
  tem uma faixa cinza de "sem classificação". Não dá para tratar o esquema de
  cores de um portal como padrão.

A rodada de 29/09/2026 conferiu outros portais municipais (Piracicaba, Itu e
São Vicente, além de Guarulhos e Osasco) e confirmou a atualização de 5 minutos
em mais um município. A comparação completa por recurso está no rascunho da
[#63](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/63).

## 3. O que as plataformas nacionais e municipais públicas cobrem

| Plataforma | O que informa | O que não informa |
| --- | --- | --- |
| Meu SUS Digital (Ministério da Saúde) | Cartão Nacional de Saúde, vacinas, exames, registro de agendamentos (segundo o grupo) e rede de saúde com busca por raio (até 70 km, segundo o grupo) e botão de rota; marcação online só nos municípios que usam o PEC e-SUS APS e habilitam a opção | Tempo de espera e disponibilidade de medicamentos |
| e-SaúdeSP (Prefeitura de São Paulo) | Histórico e agendamentos, mapa de unidades por tipo, busca de medicamentos na rede ("Remédio na Hora") e situação das salas de vacinação ("De olho na fila") | Espera em pronto atendimento |

As afirmações sobre o raio de 70 km, o botão de rota e o registro de
agendamentos já feitos seguem **a verificar** em fonte oficial. A marcação
online, ao contrário, foi conferida na página de perguntas e respostas do
Ministério: ela depende de o município usar o PEC e-SUS APS e de o gestor local
habilitar a opção, então não pode ser tratada como disponível em todo município.
Já o "De olho na fila" do e-SaúdeSP refere-se a salas de vacinação, o que
responde a dúvida registrada na [#61](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/61).

**Lacuna que motiva o projeto:** espera e estoque de medicamentos dependem de
cada município. Não existe fonte pública nacional e unificada com a ocupação das
unidades de urgência em tempo próximo do real, conforme a proposta 0001 e o ADR
0001.

## 4. Respostas de pedidos de acesso à informação (LAI)

O grupo enviou as mesmas quatro perguntas a duas secretarias de saúde: número de
unidades, capacidade de atendimento, volume de atendimentos e se o pronto
atendimento se restringe às UPAs. Os arquivos das respostas ficam fora do
repositório.

### Mogi das Cruzes (resposta de 28/08/2026)

| Unidade | Estimativa mensal de atendimentos médicos | Média mensal realizada (mar a mai/2026) |
| --- | --- | --- |
| UPA Oropó | 10.500 | cerca de 9.635 |
| UPA Rodeio | 12.000 | cerca de 12.189 |
| UPA Jundiapeba | 9.000 | cerca de 12.455 |
| UPA Jardim Universo | 10.000 | cerca de 9.363 |
| **Total** | **41.500** | **cerca de 43.643** |

Os valores são os da resposta. A soma das quatro médias arredondadas dá 43.642,
uma unidade a menos que o total informado, que a secretaria também apresenta
como aproximado.

- A secretaria informa de 300 a 400 atendimentos por dia, conforme a UPA e a
  sazonalidade, e diz que a estimativa não é limite máximo de atendimento.
- O pronto atendimento não se restringe às UPAs: a rede de urgência inclui o
  pronto-socorro da Santa Casa (conveniada), o Pró-Criança e o pronto-socorro
  infantil do hospital municipal.

### São Paulo (resposta de 11/09/2026)

- São 34 UPAs, funcionando 24 horas por dia, todos os dias.
- Em 2025 foram 7.566.504 consultas médicas nessas unidades.
- A resposta não informa capacidade e indica o Busca Saúde, sistema oficial da
  secretaria, para localização e serviços das unidades.
- Cálculo do grupo (não consta na resposta): 7.566.504 ÷ 34 ÷ 365 resulta em
  cerca de 610 consultas por dia por UPA, em média.

### Como usar esses números

- **Não são capacidade de leitos.** Os dois municípios responderam "capacidade"
  com volume mensal de consultas. A proposta 0001 e a [#57](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/57) modelam capacidade e
  ocupação por categoria de estrutura (observação, estabilização e internação).
  Esses números não servem como `capacity` do simulador, que continua sendo dado
  simulado e identificado como tal.
- **Servem para dar contexto de volume** a uma demonstração e podem alimentar a
  [#33](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/33), sempre rotulados como dado real agregado, com fonte e data.
- **Tamanho da amostra:** São Paulo (34 UPAs) comporta a amostra de 10 a 20
  unidades da proposta. Mogi das Cruzes tem 4 UPAs e cerca de 3 outros pontos de
  urgência, abaixo desse intervalo.

## 5. Implicações para o produto

1. **Escopo.** O FilaSaúde continua informativo. Os painéis municipais de
   espera medem pessoas esperando e sua gravidade clínica, o que depende de
   classificação feita por profissionais de saúde. O produto não estima espera,
   não exibe fila, não classifica risco e não recomenda unidade. A proposta
   0001 mede ocupação de estrutura, e a diferença de natureza justifica o recorte.
2. **Cadência.** O snapshot a cada 5 minutos da proposta 0001 e da [#57](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/57) tem
   referência externa em mais de um município.
3. **Paleta.** A camada "Ocupação simulada" não deve reutilizar as cores de
   classificação de risco (vermelho, laranja, amarelo, verde e azul), para não
   sugerir gravidade ou prioridade de atendimento.
4. **Aviso de estimativa e horário.** O princípio de mostrar fonte e horário
   próximo do dado, presente nos portais conferidos, já é exigência da proposta
   (seção 10).
5. **Fontes adicionais ([#30](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/30)).** A escolha já está no
   [ADR 0002](../adr/0002-additional-public-data-sources.md): GeoSampa para a
   localização de parte das unidades de São Paulo e o conjunto "UPA 24h em
   funcionamento" apenas para validação agregada futura. O Busca Saúde, indicado
   na resposta de LAI de São Paulo, não foi avaliado ali. Só vale avaliá-lo se
   trouxer algo que o CNES e o GeoSampa não têm (a resposta cita os serviços
   disponíveis em cada unidade), com formato, licença e atualização verificados.
   As contagens da LAI (34 UPAs em São Paulo e 4 em Mogi das Cruzes) também
   servem de ponto de comparação para a validação agregada, lembrando que o ADR
   0002 avisa que os recortes diferem dos do CNES.
6. **Tipos de unidade (ADR 0001).** A resposta de Mogi das Cruzes lembra que a
   urgência não se limita às UPAs. Vale conferir se os pronto-socorros dessa rede
   aparecem na consulta atual do CNES (tipos `20`, `21` e `73`).
7. **Medicamentos ([#64](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/64) e [#65](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/65)).** O saldo das farmácias públicas é público por
   lei, mas é mantido por cada gestor, com atualização que não é em tempo real.
   Não há fonte nacional. A decisão de escopo precede qualquer avaliação técnica
   das listas.
8. **Parceria ([#19](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/19) e [#67](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/67)).** A coordenadoria de urgência de Mogi das Cruzes é um
   contato institucional identificado. Ele serve de insumo para a [#67](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/67), mas nenhum
   contato externo acontece antes de o grupo aprovar a abordagem e o protocolo
   de consentimento ([#20](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/20)).

## 6. Decisões em aberto

| Questão | Ponto de partida | Decisão do grupo | Responsável/data |
| --- | --- | --- | --- |
| Citar soluções semelhantes nos relatórios? | Sim, de forma referencial, com fonte e data de acesso e sem imagens | Em aberto | — |
| Tempo de espera, fila e cores de risco ficam fora do produto? | Sim, sem exceção | Em aberto | — |
| A paleta de ocupação evita cores de risco clínico? | Sim | Em aberto | — |
| Medicamentos entram no escopo? | Decisão na [#64](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/64), antes de qualquer implementação | Em aberto | — |
| Qual município será a amostra do simulador? | São Paulo como padrão, comparado com os demais na [#67](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/67) | Em aberto | — |
| Os números da LAI entram na [#33](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/33) como dado real agregado? | Só com rótulo, fonte e data | Em aberto | — |
| Como registrar as respostas de LAI? | Issue própria, sem versionar os arquivos | Em aberto | — |

## 7. Pendências por issue

- **[#60](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/60):** registrar a fonte e a data de acesso de cada afirmação (parte já
  coberta pela conferência de 01/10/2026); confirmar o que cada município publica.
  Fluxos além de adulto e infantil (como o ginecológico citado na issue) não
  foram encontrados em nenhuma das conferências.
- **[#61](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/61):** separar dados públicos dos que exigem login; fontes oficiais.
- **[#62](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/62) e [#65](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/65):** origem oficial, edição, data e licença das duas listas.
- **[#63](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/63):** concluir a comparação com as evidências novas e decidir cada recurso.
- **[#64](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/64):** levar as três opções (não fazer, lista de referência, lista com
  disponibilidade simulada) ao grupo.
- **[#66](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/66):** avaliar candidatos de interface contra o escopo informativo.
- **[#67](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/67):** montar a tabela de municípios (o que publica, contato possível e
  recomendação), sem contato externo antes da aprovação.
- **[#68](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/68):** escrever a seção de soluções semelhantes. O relatório parcial ([#15](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/15)) já consta como encerrado, então o destino principal é o final ([#16](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/16)).

## 8. Limites e cuidados com o material de pesquisa

- Arquivos brutos de pesquisa (PDFs, prints, respostas de LAI) ficam fora do Git.
  Eles trazem nomes de pessoas, identificadores de processos e marcas de
  terceiros, e o repositório é público.
- A pesquisa é comparativa e acadêmica. Não há cópia de telas, textos ou marcas,
  raspagem, consulta em massa nem engenharia reversa de nenhum produto. As
  funcionalidades são descritas com palavras próprias.
- Os valores de espera observados nos portais são de um instante e pertencem aos
  municípios. O FilaSaúde não os reutiliza nem os redistribui.
- Os links dos portais conferidos e as referências completas ficam nos materiais
  do grupo, fora do repositório, e serão citados no relatório conforme o formato
  da disciplina ([#68](https://github.com/PJIEixoComputacaoUnivesp/FilaSaude/issues/68)).
- Este documento não é parecer jurídico. Dúvidas sobre uso de material de
  terceiros vão à orientação acadêmica antes de qualquer publicação.

## 9. Referências públicas

- [Meu SUS Digital: página do Ministério da Saúde](https://www.gov.br/saude/pt-br/composicao/seidigi/meususdigital)
  e [Rede de Saúde](https://meususdigital.saude.gov.br/publico/rede-saude)
  (conferidos em 29/09/2026; a tela de Rede de Saúde não pôde ser inspecionada)
- [Meu SUS Digital: é possível marcar consultas?](https://www.gov.br/saude/pt-br/composicao/seidigi/meususdigital/perguntas-e-respostas/cidadao/8-e-possivel-marcar-consultas)
  (conferido em 09/10/2026): marcação online depende do PEC e-SUS APS e da
  habilitação pelo município
- [Prefeitura de São Paulo: funcionalidades do e-SaúdeSP](https://prefeitura.sp.gov.br/w/saiba-mais-sobre-as-funcionalidades-do-aplicativo-e-sa%C3%BAdesp-1)
  (conferido em 29/09/2026)
- [Lei nº 14.654/2023](https://www2.camara.leg.br/legin/fed/lei/2023/lei-14654-23-agosto-2023-794579-norma-pl.html):
  divulgação dos estoques das farmácias públicas
- [Busca Saúde, da Prefeitura de São Paulo](https://buscasaude.prefeitura.sp.gov.br/):
  indicado na resposta de LAI de São Paulo e ainda não conferido pelo grupo
- [ADR 0002](../adr/0002-additional-public-data-sources.md): fontes públicas
  adicionais, avaliadas em 06/10/2026
