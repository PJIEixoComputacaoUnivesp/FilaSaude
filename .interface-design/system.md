# FilaSaúde Interface System

## Direction

- Personality: calm, trustworthy, direct, and accessible.
- Product surface: content-first public-service application, not a campaign
  site. There is no landing page; the first screen is the tool.
- Depth: borders and subtle surface-color shifts; avoid decorative shadows.
- Language: plain Brazilian Portuguese with factual, non-clinical wording.

## Journey

- The map is the entry point (`/`). The product exists to show where units are
  and, once the simulated occupancy layer of proposal 0001 lands, how busy
  they are, so the map is the visual starting point and the list follows it.
- The list (`/units`) is the accessible equivalent of the map, not a second
  product. Map markers are drawn on a canvas and cannot be reached by keyboard
  or screen reader, so everything the map shows must also be reachable in the
  list (this includes the occupancy layer, as required by #79).
- Map and list share one search through the URL: `?uf=SP&q=osasco`. A missing
  `uf` means "Todo o Brasil". The filters are held above the routes
  (`SearchFiltersProvider`), so they survive a change of page: the header links,
  "Ver em lista" and "Voltar ao mapa" carry the live search even before the URL
  catches up. The URL is written with `replace` (typing adds no history entries)
  and, for the text, 300 ms after typing pauses or on blur, because Safari
  throws after 100 `replaceState` calls in 30 seconds. The URL is followed only
  when something else changes it (a link, Voltar); reading the page's own writes
  back drops characters while typing.
- No detalhe, “Voltar à lista” e “Ver no mapa” ficam junto ao título, antes
  dos dados e do histórico. Tipo e código CNES aparecem uma vez no cabeçalho
  do registro.
- “Como chegar” aparece igual em toda unidade, no detalhe e no popup ao lado de
  “Ver detalhes”, nunca como sugestão de qual unidade procurar. No Android abre
  um link `intent:` com esquema `geo`, que o sistema entrega ao app de mapas
  escolhido, e cai no Google Maps na web quando não há app; nos demais
  (iPhone e computador), o Google Maps em nova aba, que no iPhone abre o app
  se estiver instalado. O link não leva origem: a rota parte da posição
  que o app obtém. Posições aproximadas (centro do município) buscam por nome
  e endereço, para a rota não terminar no centro da cidade.
- Every unit has a stable detail route at `/units/:cnes`. Cards link to that
  detail and to a selected marker on the map. The marker popup links back to
  the same card, preserving the live UF and text filters; a target beyond the
  first progressive page is revealed and focused.
- Navigation has two destinations, "Mapa" and "Lista", visible at every width
  with no menu button. "Sobre os dados" lives in the footer. Removed or unknown
  paths (`/map`, anything else) redirect to `/` and keep the query string.
- The safety notice is in the footer of every screen. Source and update date
  stay on each unit, in the card and in the map popup. Below `sm`, the footer
  keeps one visible line ("Informativo: sem orientação médica") and "Saiba
  mais" opens the full notice and "Sobre os dados" in a native popover. It is
  never a hover tooltip: touch has no hover, and the notice must stay visible.
- Search matches name and address, which is what its labels promise ("unidade,
  cidade ou bairro"). It does not match service hours: filtering by
  characteristic is a feature of its own (#29).
- Results have a neutral order (UF, city, name). Nothing ranks, highlights or
  recommends a unit. That holds when the map becomes the entry point and when
  it shows occupancy: ranges always pair text with color and explain that
  they do not represent clinical risk classification.
- The national query is answered from the local CNES copy by design, so it is
  shown as plain text ("Cópia nacional do CNES, atualizada até…"). Only a real
  outage of the official source gets the amber `role="status"` notice.

## Simulated occupancy

- The "Ocupação simulada" layer (proposal 0001) exists only when the API
  answers `GET /occupancy`; it starts off and the choice lasts for the session.
  The map, the list and the unit detail share it (`OccupancyLayerProvider`).
- Fontes nacionais alimentam a ocupação continuamente, independentemente de
  visitas, localização, busca, UF ou interruptor da camada. Esses controles
  afetam apenas a visualização de cada visitante. Não há seletor público nem
  endpoint de escrita para controlar as fontes; cenários de teste ficam na CLI
  do operador.
- Mapa, lista e resumo do detalhe priorizam pessoas esperando e em atendimento.
  A cor usa apenas pessoas esperando por posto ativo: baixa abaixo de 1,
  moderada de 1 a menos de 3, alta a partir de 3. São convenções da simulação.
  Sem espera ou postos ativos informados, mostrar “Espera não informada”; zero
  pessoas esperando é um valor válido. Não usar leitos como fallback.
- “Posto” fica só no código e nos contratos (`serviceSlots`): na tela é lido
  como posto de saúde. A interface usa “Capacidade de atendimento”,
  separando “Em operação: até N pessoas simultaneamente” (`serviceSlots`) de
  “Capacidade total do cenário: N pessoas simultaneamente”
  (`installedServiceSlots`), e descreve as
  faixas como a fila em relação à capacidade. A razão por posto não aparece.
- Leitos por categoria e histórico de ocupação ficam como informações
  complementares no detalhe. A faixa de espera da tabela histórica usa a mesma
  regra do mapa. Leitos, pessoas em atendimento e conclusões não mudam a cor.
- Paleta de espera: verde, amarelo e vermelho com anel escuro, cinza sólido
  para dado não informado e anel cinza tracejado sem confirmação recente.
  Texto acompanha a cor; a legenda explica que não é classificação de risco.
  Controles permanecem violetas. Manter `occupancy.ts` e `index.css` coerentes.
- Say it once, in the right place. Each container of simulated data (popup and
  card summary, detail section) carries one mark: the violet tint or the
  section title, plus the line "Simulador do FilaSaúde · enviado às HH:MM".
  Values inside do not repeat "simulado". The short notice
  (`SIMULATION_NOTICE`, or `SIMULATION_NOTICE_SHORT` on the narrow map panel)
  stays visible while the layer is on, with a link to "Sobre os dados", which
  holds the full explanation. The legend keeps one color notice (not risk
  classification, not which unit to seek). No pill, no repeated paragraphs.
- In the list the occupancy is one more field of the card, after the registry
  data, not a highlight. On desktop the map panel is capped in height and
  scrolls. On mobile it contains only search, the filters action and the layer
  switch with a short simulation notice. Enabling the layer does not reveal
  long controls over the map.
- SSE aplica apenas as unidades alteradas ao estado nacional; REST inicial e
  reconexão recompõem o snapshot. O histórico acompanha os eventos da unidade,
  sem polling. Durante falhas, preservar os dados anteriores e indicar a
  reconexão, mantendo a expiração de confirmação. Refs #78 e #79.
- Refreshes replace data in place: no focus change and no announcement. Only
  turning the layer on announces the count; a failed refresh with data still
  shown is a `status`, not an `alert`.

- O detalhe reúne espera, estimativa calculada pelo FilaSaúde, leitos, postos
  instalados/ativos e serviços do cenário simulado. A lista e o popup mostram
  a estimativa quando disponível, sem alterar a cor nem a ordem das unidades.
  A estimativa usa somente o histórico agregado recebido; é distinta de média
  observada de esperas individuais e fica dentro de um bloco já marcado como
  simulado, com uma frase de que não é previsão para pessoas reais.
  Ausência, histórico insuficiente, ritmo nulo e expiração são explícitos;
  dados antigos não mantêm uma estimativa apresentada como atual.

## Foundations

- Spacing base: 4px, using the Tailwind spacing scale.
- Typography: system sans-serif for fast loading and broad character support.
  `Inter` leads the stack for people who have it installed; no web font is
  loaded, so do not assume it renders.
- Corners: restrained; pills only for short statuses or compact metadata.
- Color: gray for text, the `fila-*` brand palette (`fila-blue` #1266CC,
  `fila-green` #00A88F, `fila-cyan` #00A5E3, `fila-bg` canvas) for brand and
  informational emphasis, and amber for cautions. The brand palette matches
  the gradient used in the logo (`apps/web/src/Logo.tsx`). Use the semantic
  aliases declared in `apps/web/src/index.css`.
- `fila-green` is about 3:1 on white, so it is for fills and graphics only.
  Green text uses `fila-green-ink` (#007A68, 5.0:1 or more on white and on
  `fila-bg`). Text is 4.5:1 or more and controls and graphics 3:1 or more.
- Never rely on color alone for status or meaning.

## Accessibility

- Focus: a solid 3px `fila-blue` ring with a 2px offset, declared once for
  `:focus-visible`. Do not remove it from controls with `outline-none`; add a
  border change on top if more emphasis is needed. The map container draws it
  inside, because an outside ring is clipped by the viewport.
- Every route has one `<h1>`, a title in the form `Página · FilaSaúde`
  (`usePageHeading`), and moves focus to the `<h1>` on client navigation, not
  on first load. The map's `<h1>` is visually hidden.
- Landmarks: skip link, banner, `nav` ("Forma de visualização"), `main`
  (`#conteudo`), `role="search"` forms, `contentinfo`.
- Visible counts are not live regions. `LiveStatus` announces the result count
  once typing pauses (600 ms), so a screen reader is not interrupted per key.
- Links that open a new tab say so in hidden text ("abre em nova aba").
- Motion: with `prefers-reduced-motion` the map turns off zoom, fade, marker and
  inertia animation, `fitBounds` and `setView` do not animate, and Leaflet's CSS
  transitions are disabled.
- Leaflet ships English strings and a flag in its attribution prefix. They are
  replaced in `UnitsMap` (`MapLocalization`); keep new map controls in
  Portuguese. The OpenStreetMap credit stays in the tile layer attribution.

## Mobile

- Mobile-first: 16px side gutters (`px-4`) on narrow screens, 24px from `sm`.
- Touch targets are at least 44px (`min-h-11`, `h-11 w-11` for icon buttons).
  Leaflet's 30px zoom buttons and 24px popup close button are overridden in
  `index.css`. A compact link in a dense row keeps the target with `min-h-11`
  and a negative vertical margin.
- Full-screen views (the map) use `dvh`-based flex layouts, never
  `100vh` minus a hard-coded header height.
- Os controles completos do mapa exigem largura de pelo menos 40rem e altura
  de pelo menos 32rem (`map-wide`). Em telas largas com pouca altura, o painel
  compacto fica à esquerda e libera espaço ao lado para o popup; filtros e
  legenda continuam acessíveis pela janela modal. O mínimo de altura do mapa
  é preservado para permitir rolagem em telas muito baixas ou com zoom.
- Text is cut before controls on narrow screens. In the map panel the field
  labels are screen-reader-only outside `map-wide` (the select shows its value
  and the field has a placeholder), and the origin line is the one-line `shortText`
  ("Cópia do CNES de 22/09/2026"); an outage keeps its full amber notice. From
  `sm` the footer is one short paragraph with the link inline; below it, the
  short line and popover described in Journey. The map's minimum height
  depends on the screen height, not its width, so a phone held sideways does
  not scroll.
- Reserve the height of a results screen (`min-h-[60dvh]`) so the footer does
  not jump when cards replace a short loading state.
- Long result lists load progressively (24 at a time, "Mostrar mais") with a
  visible "Mostrando X de Y" count, instead of rendering every record at once.
- Map overlays stay compact on narrow screens, and map fitting must keep points
  out from under them. In DOM order the search panel comes before the map, so
  keyboard users reach it first.
- O popup de uma unidade fica livre do painel de busca, do cabeçalho, dos botões
  de zoom, da atribuição e do painel “Sua localização”: o painel do popup fica
  abaixo dos controles do Leaflet, então o espaço é descontado na geometria, e
  o popup é reposicionado quando o conteúdo cresce depois de abrir. “Ver
  detalhes” vem logo abaixo do nome; o restante rola dentro do popup em telas
  baixas. Fora de `map-wide`, o painel “Sua localização” fica invisível
  enquanto há um popup aberto e volta ao fechá-lo.
- O painel “Sua localização” mantém “Atualizar” e “Remover” juntos na mesma
  linha. Remover a posição é anunciado, inclusive quando desativa “Ao redor de
  você”; quando a opção está indisponível, o campo Estado diz o motivo.
- Quando o enquadramento da posição não mostra nenhuma unidade, o painel “Sua
  localização” diz “Nenhuma unidade nesta parte do mapa.” e oferece “Mostrar
  unidades ao redor de você”, sem destacar nem ordenar unidade alguma.
- Fora de `map-wide`, o painel do mapa resume o aviso do catálogo em uma linha;
  o texto completo fica na folha de filtros. A mensagem de vazio vem antes da
  ação que a resolve. Em `map-wide`, um painel mais alto que o mapa rola e
  mostra sombra na borda onde há mais conteúdo.
- No celular, UF, contagem, filtro de unidades simuladas, procedência e legenda
  ficam em uma janela modal aberta por “Filtros”. O atalho “Legenda” junto do
  interruptor abre a explicação expandida. A folha tem altura fixa, então
  “Voltar ao mapa” não muda de lugar quando o conteúdo muda, e permanece
  visível durante a rolagem; Escape ou um toque no fundo fecha a janela e o
  foco retorna ao acionador. O selo do botão “Filtros” fica abaixo da palavra,
  para não estreitar a busca. A partir de `sm`, a folha vira um cartão estreito no
  canto inferior esquerdo.
  Preservar a área segura inferior do dispositivo e alvos de toque de 44 px.
- Text fields are 16px or larger, and placeholders are `slate-500` or darker.
- Na lista, fora de `map-wide` (celular em retrato ou paisagem), os controles
  secundários da simulação ficam em “Filtros e legenda”, recolhidos por padrão.
  Em “Ao redor de você”, Estado e Distância ficam lado a lado. O interruptor e o aviso de dados fictícios
  ficam visíveis; o acionador indica quando há filtro ativo.
- No detalhe, os leitos por categoria usam blocos com rótulos e valores abaixo
  de `sm`; a tabela completa permanece em telas maiores. Ocupados, capacidade
  simulada e percentual ficam visíveis juntos sem rolagem horizontal.

## Initial patterns

- Geolocation is requested when the person enters the app (not on /admin),
  with no button to ask for it. A refusal is silent; a permission granted
  later in the browser brings the position without a reload. A quick network
  reading frames the map at once and a precise one replaces it when more
  accurate ("Ajustando a precisão…" meanwhile), never taking back a view the
  person moved or a selected unit. The position frames the map only inside
  the filtered area; elsewhere the panel says the person is outside it.
- Status lives in a separate control at the bottom of the map, shown while
  locating, after a failure (with a retry when one can help) or with a
  position, then collapsed to one line once the precise reading settles.
  Screen readers hear one announcement per change, from a status region
  apart from the panel. Text never names the marker's color.
- Marker: cyan dot (`fila-cyan`) with a white and a `fila-cyan-ink` ring,
  18px, distinct from unit discs by size and shape; its halo pulses twice on
  arrival and rests. Accuracy in text and as a circle on the map. Preserve
  filters and keep the position only in tab memory.
- Once settled, offer "Atualizar" alongside "Remover". While refreshing,
  keep the previous marker, accuracy and nearby filter until a new reading
  arrives; cancellation or failure clears the position. Explicit removal
  also ignores late callbacks.
- "Ao redor de você" is an explicit, session-only area filter shared by the
  map and list. Its initial straight-line radius is the smallest available
  step that contains three positioned units, never smaller than the reported
  location accuracy, and at most 500 km. Offer only steps that add units; at
  the cap, show available results and an explicit action to show all of Brazil.
  Draw the selected radius on the map and filter its markers to the same area
  as the list. Keep this mode and radius out of the URL and never send the
  person's coordinates to the API.

- Product status: compact bordered pill with explicit text.
- Safety notice: amber-tinted surface with a strong left border and direct label
  where it needs emphasis ("O que o FilaSaúde não faz", near the top of Sobre);
  a short plain footer paragraph elsewhere. Data-quality notices (source
  outage, approximate or corrected position, in the popup too) use the same
  amber surface (`AMBER_NOTICE` in `notice.ts`), never amber text alone.
- Radii: `rounded-2xl` for cards and panels, `rounded-xl` for boxes inside them,
  notices and boxed controls (inputs, selects, filled buttons); `rounded-lg`
  only for the compact map panel controls and text-like buttons.
- The layer controls in the list are a violet-tinted card
  (`occupancy-surface`), not a white card, so they do not read as one more
  unit result.
- Public-data records must expose source and update time in their own context.
- Empty search: say what was searched and offer "Limpar busca".

## Admin area

- The admin page (`/admin`) is outside the public navigation and marked
  `noindex`. Secrets such as the admin token stay in React memory only.
- A button that stays focused while it works uses `aria-disabled` and a ref
  guard instead of `disabled`, which would drop focus and not give it back.
- A destructive action asks for confirmation inline, moves focus to the safe
  choice ("Cancelar"), and after it completes announces the result in a live
  region and moves focus to the list heading.
- Long unbroken text (URLs pasted into a field) uses `wrap-anywhere` and grid
  columns are `grid-cols-1`, otherwise the text widens the whole page.
- A map used to pick a point is capped by the screen height (a map that fills it
  leaves no room to scroll) and its zoom buttons are 44px on touch screens. The
  fields that hold the same values stay the keyboard path.
- Do not use `inputmode="decimal"` for signed coordinates: the iOS decimal
  keyboard has no minus sign.

Update this file only when a reusable decision is introduced or intentionally
changed. Component-specific implementation details do not belong here.
