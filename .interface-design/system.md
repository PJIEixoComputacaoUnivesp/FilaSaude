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
- Color: slate for text, emerald for brand/informational emphasis, and amber for
  cautions. Use the semantic aliases declared in `apps/web/src/index.css`.
- Never rely on color alone for status or meaning.

## Initial patterns

- Product status: compact bordered pill with explicit text.
- Safety notice: amber-tinted surface with a strong left border and direct label.
- Public-data records must expose source and update time in their own context.

Update this file only when a reusable decision is introduced or intentionally
changed. Component-specific implementation details do not belong here.
