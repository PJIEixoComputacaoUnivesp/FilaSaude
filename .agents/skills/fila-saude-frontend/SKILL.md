---
name: fila-saude-frontend
description: Design, implement, and review the FilaSaúde React/Vite/Tailwind interface in apps/web. Use for screens, components, navigation, frontend data states, accessibility, responsive behavior, and design-system decisions; do not use for backend-only work.
---

# FilaSaúde Frontend

Build a trustworthy, accessible interface for consulting public health-unit data.
The user's instructions take precedence over this skill.

## Start from project context

Read `AGENTS.md`, the affected files in `apps/web`, and any existing
`.interface-design/system.md`. Preserve established patterns unless the task
explicitly changes them. When a change establishes a reusable visual decision,
record the concise decision and rationale in `.interface-design/system.md`;
small changes do not require inventing a design system.

## Protect the product boundary

- Present public information and its provenance. For fetched records, make the
  source and update time visible or reachable from the same context.
- Do not add diagnosis, symptom assessment, clinical triage, or language that
  recommends one facility as medically appropriate.
- Treat distance and availability as factual attributes. Labels, sorting, color,
  and emphasis must not imply medical priority.
- Never invent facility facts or silently hide missing/stale data. Design an
  explicit fallback state.
- Use direct Brazilian Portuguese. Urgent-care notices should point to official
  channels without sounding like personalized medical advice.

## Shape the interface deliberately

- Favor calm, high-trust, content-first product UI over a promotional landing-page
  aesthetic. Use decoration only when it improves hierarchy or comprehension.
- Define reusable colors, typography, spacing, radii, and shadows as Tailwind 4
  theme variables in CSS. Prefer semantic project tokens to scattered palette
  choices, arbitrary values, and one-off hexadecimal colors.
- Choose one depth treatment for a surface family (borders, surface shifts, or
  shadows) and apply it consistently. Use a 4px spacing base.
- Reuse an existing component when its semantics match. Extract a component
  after a pattern repeats or owns meaningful behavior; avoid premature wrappers.
- Design mobile-first and verify narrow, intermediate, and wide layouts. Keep
  primary information and actions usable without hover.

## Model behavior completely

- Keep React state minimal and derive filtered or formatted values during render
  when practical. Place state at the closest common owner.
- Keep data access and API response mapping outside presentational components.
- For asynchronous data, account for loading, success, empty, error, offline, and
  stale-data states as relevant. Avoid layout shifts that obscure context.
- Give destructive or irreversible actions confirmation and feedback. Searches
  and filters should preserve the user's query when requests fail.

## Accessibility is part of completion

- Start with semantic HTML and native controls; add ARIA only when native
  semantics cannot express the interaction.
- Provide programmatic labels, useful error messages, visible keyboard focus,
  logical heading order, and keyboard-complete interaction.
- Do not communicate status using color alone. Maintain WCAG AA contrast and
  respect reduced-motion preferences.
- Announce meaningful asynchronous results without moving focus unexpectedly.
  Move focus only when the interaction requires a new context, such as a dialog.

## Verify proportionally

Run the checks affected by the change, normally:

```bash
pnpm --filter @filasaude/web lint
pnpm --filter @filasaude/web typecheck
pnpm --filter @filasaude/web test
pnpm --filter @filasaude/web build
```

Skip a missing test script until the test stack is introduced. Add tests for
behavior and accessibility-sensitive interactions, not static implementation
details. For visible changes, inspect the rendered result at representative
viewport sizes when browser tooling is available.

## Decision sources

- React component/state model: https://react.dev/learn/thinking-in-react
- Tailwind theme variables: https://tailwindcss.com/docs/theme
- Vite client environment security: https://vite.dev/guide/env-and-mode
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
