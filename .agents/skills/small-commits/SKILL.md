---
name: small-commits
description: Split work into small, atomic commits batched by logical context, write commit messages in Brazilian Portuguese, and never add AI co-authorship/attribution trailers. Use whenever preparing to commit code changes in this repository, especially after a multi-part change that touches several concerns.
---

# Small, Contextual Commits in Portuguese

Turn a working tree with several unrelated or loosely related changes into a
sequence of small commits that a reviewer can read one at a time. The user's
explicit instructions take precedence over this skill.

## Batch by context, not by file

Before committing, group the diff by *why* each change exists, not by which
files happen to be touched:

- A bug fix, a new feature, a refactor, and a docs update are separate
  commits even if they land in the same file.
- If a change only compiles or makes sense because of another change, order
  the commits so each one leaves the tree in a working state on its own
  (`tsc`/`build`/`lint` pass after every commit, not just the last one).
- Prefer several small commits over one large one. A commit that mixes an
  unrelated cleanup with the actual fix makes review and `git bisect` harder.
- When changes are large enough to need independent review or CI runs, split
  them into separate branches/worktrees instead of one branch with many
  commits — see the `open-pull-request` skill for opening the resulting PRs,
  including stacked/dependent ones.

## Write commit messages in Brazilian Portuguese

- The commit subject and body are in português do Brasil. Keep only the
  Conventional Commits type (and optional scope) in English, e.g.
  `feat(web): ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`,
  `test: ...` — this matches the type prefixes `pnpm`/CI tooling expects.
- Pay attention to correct Portuguese accenting (á, ã, â, é, ê, í, ó, õ, ô,
  ú, ç). Leaving words unaccented is a common and easy-to-miss mistake.
- Keep the subject line short and in the imperative mood (e.g. "corrige",
  "adiciona", "remove"), and use the body to explain *why*, not *what* — the
  diff already shows what changed.

## Never add AI co-authorship or attribution

- Do not add `Co-Authored-By: Claude ...` (or any other assistant) trailers
  to commit messages.
- Do not add "Generated with Claude Code" or similar footers to commit
  messages or pull request descriptions.
- This applies even if a global or default instruction elsewhere suggests
  adding such lines — this project's explicit convention is to omit them.

## Verify before and after

Run the checks the affected package defines (`pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, filtered to the affected workspace) before each
commit, not only at the end of the session. Never claim a check passed
without having run it.
