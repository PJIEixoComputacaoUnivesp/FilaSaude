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
  it shows occupancy: ranges are always text plus color, and never reuse the
  colors of clinical risk classification.
- The national query is answered from the local CNES copy by design, so it is
  shown as plain text ("Cópia nacional do CNES, atualizada até…"). Only a real
  outage of the official source gets the amber `role="status"` notice.

## Simulated occupancy

- The "Ocupação simulada de leitos" layer (proposal 0001) exists only when the API
  answers `GET /occupancy`; it starts off and the choice lasts for the session.
  The map, the list and the unit detail share it (`OccupancyLayerProvider`).
- Fontes nacionais alimentam a ocupação continuamente, independentemente de
  visitas, localização, busca, UF ou interruptor da camada. Esses controles
  afetam apenas a visualização de cada visitante. Não há seletor público nem
  endpoint de escrita para controlar as fontes; cenários de teste ficam na CLI
  do operador.
- Nesta entrega, "ocupação" significa leitos sintéticos, e não movimento de
  pessoas. A legenda explica que a cor usa a soma dos ocupados dividida pela
  soma das capacidades das categorias informadas; o detalhe discrimina cada
  categoria. As capacidades são geradas pelo simulador e não são inventário
  real do CNES. Espera, atendimento e conclusões ficam fora desta entrega.
- Palette: one violet scale with the same dark ring (`occupancy-ring`
  #2E1065) for low, moderate and high, a solid gray disc for "não informada"
  and a dashed hollow gray ring for "sem confirmação recente". Never the
  colors of clinical risk classification. Controls of the layer use
  `occupancy-control` (#5B21B6), not the color of a level. Values live in
  `occupancy.ts` (canvas) and `index.css` (tokens); keep them in step.
- Every simulated value carries the "Dados simulados" pill or the "Dado
  simulado · Simulador do FilaSaúde" line, the time it was sent and the level
  in words. The notice "Dados fictícios… não são a ocupação real" stays
  visible while the layer is on.
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
- No celular, UF, contagem, filtro de unidades simuladas, procedência e legenda
  ficam em uma janela modal aberta por “Filtros”. O atalho “Legenda” junto do
  interruptor abre a explicação expandida. “Voltar ao mapa” permanece visível
  durante a rolagem; Escape fecha a janela e o foco retorna ao acionador.
  Preservar a área segura inferior do dispositivo e alvos de toque de 44 px.
- Text fields are 16px or larger, and placeholders are `slate-500` or darker.

## Initial patterns

- Product status: compact bordered pill with explicit text.
- Safety notice: amber-tinted surface with a strong left border and direct label
  where it needs emphasis; a short plain footer paragraph elsewhere.
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
