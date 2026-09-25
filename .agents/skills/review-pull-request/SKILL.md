---
name: review-pull-request
description: Review a GitHub pull request, a branch, or pending changes for security, bugs and logic errors, performance, code quality and maintainability, with positive highlights and action items, using the persistent code-reviewer agent, and optionally post the review to the PR as comments. Use when the user asks to review a PR, review a branch, "revisar" changes, or post a review; do not use for opening, merging, or approving PRs.
---

# Review Pull Request

This skill is the entry point for the `code-reviewer` agent in
`.agents/agents/code-reviewer.md`. That file is the single source of truth for
target resolution, review rules, output, the `.last-review` marker, the
`.last-review.json` file and the persistent memory. Do not re-implement any of
it here. The user's explicit instructions take precedence.

## 1. Run the reviewer

1. Pass the user's request **verbatim** to the agent, plus anything the user
   said in this conversation about focus, full vs incremental review, posting
   to the PR, or things to remember (quote those as the user's words). Do not
   resolve the target yourself.
2. If your tool supports subagents (Claude Code reads `.claude/agents/`, a
   symlink to `.agents/agents/`), delegate to `code-reviewer`. Otherwise read
   `.agents/agents/code-reviewer.md` in full and follow it inline, section by
   section.
3. Relay the review exactly as the agent wrote it: do not soften, reorder, or
   drop findings.
4. If the agent replied `Revisão interrompida: ...`, relay the question. When
   the user answers, run step 1 again with the original request plus the
   answer.

## 2. After the review

- **The user asks to remember something, or corrects or rejects a finding:**
  read section 9 of the agent file and save it to the agent memory yourself,
  now, following 9.4. Confirm in one line with the file name.
- **The user asks for fixes:** that is a separate task, outside this skill.

## 3. Post to GitHub (only on explicit request)

Posting happens only when the user explicitly asks for it. The agent writes
`.last-review.json` at the root of the reviewed checkout (ignored by Git) and,
when posting was requested, ends the review with a dry-run summary and the
question `Publicar esta revisão no PR #<n>? (sim/não)`.

- If the user asked to post **after** the review, run the dry-run yourself and
  show its summary line (stderr) with the same question:

  ```bash
  node .agents/skills/review-pull-request/scripts/post-review.mjs <checkout>/.last-review.json --dry-run > /dev/null
  ```

- Only after the user answers `sim`, post:

  ```bash
  node .agents/skills/review-pull-request/scripts/post-review.mjs <checkout>/.last-review.json
  ```

  and give the user the review URL it prints.

| Exit code | Meaning | What to do |
|---|---|---|
| 0 | Posted (or dry-run/validation ok) | Relay the output. |
| 1 | Invalid file or arguments | Relay the error; re-run the review. |
| 2 | `gh` missing or not authenticated | Ask the user to run `gh auth login`. |
| 3 | The PR head moved after the review | Tell the user to re-run the review. Use `--force-stale` only if the user explicitly asks; every finding then goes to the review body. |
| 4 | GitHub API failure | Relay the error; do not retry more than once. |

The script posts one review with event `COMMENT` via
`gh api repos/{owner}/{repo}/pulls/{n}/reviews`, with `commit_id` set to the
reviewed commit. Findings whose line is in the PR diff (parsed from the
`pulls/{n}/files` patches) become inline comments; the others go under
`### Achados fora do diff do PR` in the review body. Its unit tests run with
`node --test .agents/skills/review-pull-request/scripts/post-review.test.mjs`.

## Never

Approve, request changes, merge, push, or commit as part of a review, and
never post without the user's explicit `sim` after the dry-run summary.
