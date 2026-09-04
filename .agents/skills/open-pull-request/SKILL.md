---
name: open-pull-request
description: Prepare, publish, and open a GitHub pull request with the gh CLI from the current repository. Use when the user asks to create or open a PR, including draft or dependent PRs; do not use for merging, approving, releasing, or opening issues.
---

# Open Pull Request with GitHub CLI

Create a reviewable PR whose title, body, base, head, and reported validation match
the actual branch. The user's explicit instructions take precedence over this skill.

## Establish the changeset

Read repository guidance such as `AGENTS.md`, then inspect without modifying work:

```bash
git status --short --branch
git remote -v
git branch --show-current
git log --oneline <base>..HEAD
git diff --stat <base>...HEAD
git diff --check <base>...HEAD
```

- Resolve the base explicitly. Prefer the user's base, then an intentional stacked
  branch, then the repository default branch reported by `gh repo view`.
- Do not open a PR from the default branch or include unrelated working-tree
  changes. PR contents come from committed changes, so preserve dirty files and
  explain when uncommitted work is outside the PR.
- Check for an existing PR from the head before creating another:

```bash
gh pr list --head <branch> --state all --json number,state,title,url,baseRefName
```

Return an existing open PR instead of duplicating it. If a closed PR exists, report
it and determine whether reopening or a new branch matches the request.

## Validate before publishing

Run the checks required by repository guidance and the affected package. Never
claim a check passed unless it ran successfully. Distinguish code failures from
environment restrictions, and retry with appropriate authorization only when the
task permits it.

Push the exact head only when opening the PR is authorized:

```bash
git push -u origin HEAD
```

Do not force-push unless the user explicitly authorizes rewriting the remote
branch. Do not commit unrelated files just to make the tree clean.

## Write a useful PR

Use a concise Conventional Commit-style title that describes the outcome. When
`.github/pull_request_template.md` exists, use it as the body structure, replace
its comments/placeholders with inspected evidence, and remove inapplicable
sections or checklist items. Otherwise, compose the body with these sections when
relevant:

```markdown
## Summary

- What changed and why

## Validation

- `exact command` — passed

## Dependencies

- Depends on #123, or "None"
```

Mention migrations, screenshots, rollout risks, skipped checks, and follow-up work
only when they exist. Do not inflate scaffold PRs with generic prose.

Create non-interactively with explicit refs so `gh` cannot select or publish a
different branch:

```bash
gh pr create --base <base> --head <branch> --title <title> --body-file <file>
```

Use `--draft` when the user asks for a draft or the branch is intentionally not
ready for review. For dependent work, state the dependency and explain any
temporary extra commits in the diff. Do not add reviewers, labels, projects, or
assignees unless requested.

## Verify and report

After creation, query the PR instead of relying only on command output:

```bash
gh pr view <branch> \
  --json number,url,title,baseRefName,headRefName,state,isDraft
```

Return the clickable URL, number, base/head, draft state, and validation summary.
Opening a PR never authorizes `gh pr merge`, auto-merge, approval, branch deletion,
or any release action.

If `gh auth status` reports invalid or missing credentials, stop before creation
and ask the user to authenticate with `gh auth login`. Never print, copy, or derive
tokens from Git credential helpers.

## Command reference

- Create: https://cli.github.com/manual/gh_pr_create
- Inspect: https://cli.github.com/manual/gh_pr_view
- Checks: https://cli.github.com/manual/gh_pr_checks
