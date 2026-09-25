# FilaSaúde Interface System

## Direction

- Personality: calm, trustworthy, direct, and accessible.
- Product surface: content-first public-service application, not a campaign site.
- Depth: borders and subtle surface-color shifts; avoid decorative shadows.
- Language: plain Brazilian Portuguese with factual, non-clinical wording.

## Foundations

- Spacing base: 4px, using the Tailwind spacing scale.
- Typography: system sans-serif for fast loading and broad character support.
- Corners: restrained; pills only for short statuses or compact metadata.
- Color: gray for text, the `fila-*` brand palette (`fila-blue` #1266CC,
  `fila-green` #00A88F, `fila-cyan` #00A5E3, `fila-bg` canvas) for brand and
  informational emphasis, and amber for cautions. The brand palette matches
  the gradient used in the logo (`apps/web/src/Logo.tsx`). Use the semantic
  aliases declared in `apps/web/src/index.css`.
- Never rely on color alone for status or meaning.

## Mobile

- Mobile-first: 16px side gutters (`px-4`) on narrow screens, 24px from `sm`.
- Touch targets are at least 44px (`min-h-11`, `h-11 w-11` for icon buttons).
- Full-screen views (the map) use `dvh`-based flex layouts, never
  `100vh` minus a hard-coded header height.
- Long result lists load progressively (24 at a time, "Mostrar mais") with a
  visible "Mostrando X de Y" count, instead of rendering every record at once.
- Map overlays stay compact on narrow screens, and map fitting must keep points
  out from under them.

## Initial patterns

- Product status: compact bordered pill with explicit text.
- Safety notice: amber-tinted surface with a strong left border and direct label.
- Public-data records must expose source and update time in their own context.

Update this file only when a reusable decision is introduced or intentionally
changed. Component-specific implementation details do not belong here.
