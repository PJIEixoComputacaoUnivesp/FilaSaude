---
name: review-pull-request
description: Review a GitHub pull request, a branch, or pending changes for security, bugs and logic errors, performance, code quality and maintainability, with positive highlights and action items, using the persistent code-reviewer agent. Use when the user asks to review a PR, review a branch, or "revisar" changes; do not use for opening, merging, or approving PRs.
---

# Review Pull Request

This skill is the entry point for the `code-reviewer` agent defined in
`.agents/agents/code-reviewer.md`. That file is the single source of truth for
how to review, the output format, the `.last-review` marker, and the
persistent memory. The user's explicit instructions take precedence.

## Run the reviewer

1. Resolve the target from the request: PR number or URL, branch name, or the
   current branch against `origin/main`. Ask only if it is genuinely
   ambiguous (for example, several open PRs and no hint).
2. Run the agent:
   - **If your tool supports subagents** (Claude Code reads
     `.claude/agents/`, which points to `.agents/agents/`): delegate to the
     `code-reviewer` agent, passing the target and anything the user said
     about focus or context.
   - **Otherwise:** read `.agents/agents/code-reviewer.md` in full and follow
     it inline, step by step.
3. Relay the review to the user as the agent wrote it. Do not soften,
   reorder, or drop findings. If the agent saved a memory, mention it in one
   line.

## Rules that apply either way

- Always write the `.last-review` marker with the branch name at the end of
  the review.
- Load the agent memory from the **main checkout**
  (`<git common dir>/../.agents/agent-memory/code-reviewer/`), never from the
  current worktree.
- If the user asks you to remember something during the review, save it to
  the agent memory immediately, then continue.
- Post to GitHub only when asked, as a comment. Never approve, request
  changes, merge, or push fixes as part of a review. If the user wants the
  findings fixed, that is a separate task after the review.
