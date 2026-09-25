#!/usr/bin/env node
// Posts a code-reviewer review (.last-review.json) to a GitHub PR as ONE
// review with event COMMENT. Never approves or requests changes.
//
// Usage: node post-review.mjs <review.json> [--validate-only | --dry-run] [--force-stale]
//   --validate-only  check the file against the schema offline, no gh calls
//   --dry-run        print the exact payload, do not post
//
// Exit codes: 0 ok, 1 usage/invalid input, 2 gh missing or not authenticated,
// 3 PR head differs from the reviewed commit, 4 GitHub API failure.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SEVERITIES = ['bloqueante', 'importante', 'sugestão'];
const MAX_BODY = 65000;
const OUTSIDE_HEADING = '### Achados fora do diff do PR';

export class ExitError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Validates the review file. Returns a list of error strings (empty = valid). */
export function validateReview(review) {
  const errors = [];
  if (typeof review !== 'object' || review === null || Array.isArray(review)) {
    return ['root must be a JSON object'];
  }
  if (review.version !== 1) errors.push('version must be 1');
  if (!Number.isInteger(review.pr) || review.pr <= 0) errors.push('pr must be a positive integer');
  if (review.repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(review.repo)) {
    errors.push('repo must be "owner/name" when present');
  }
  if (typeof review.commit !== 'string' || !/^[0-9a-f]{40}$/.test(review.commit)) {
    errors.push('commit must be a full 40-character lowercase SHA');
  }
  if (typeof review.body !== 'string' || review.body.trim() === '') errors.push('body must be a non-empty string');
  if (!Array.isArray(review.findings)) {
    errors.push('findings must be an array');
    return errors;
  }
  review.findings.forEach((f, i) => {
    const at = `findings[${i}]`;
    if (typeof f !== 'object' || f === null) return errors.push(`${at} must be an object`);
    if (typeof f.id !== 'string' || f.id === '') errors.push(`${at}.id must be a non-empty string`);
    if (typeof f.path !== 'string' || f.path === '' || f.path.startsWith('/')) {
      errors.push(`${at}.path must be a repo-relative path`);
    }
    if (!Number.isInteger(f.line) || f.line <= 0) errors.push(`${at}.line must be a positive integer`);
    if (f.start_line !== undefined && (!Number.isInteger(f.start_line) || f.start_line <= 0 || f.start_line >= f.line)) {
      errors.push(`${at}.start_line must be a positive integer lower than line`);
    }
    if (!SEVERITIES.includes(f.severity)) errors.push(`${at}.severity must be one of ${SEVERITIES.join(', ')}`);
    if (typeof f.body !== 'string' || f.body.trim() === '') errors.push(`${at}.body must be a non-empty string`);
  });
  return errors;
}

/**
 * Parses a unified-diff patch (as returned by the GitHub PR files API) and
 * returns Map<newFileLine, hunkIndex> for every line commentable on the RIGHT
 * side (added and context lines).
 */
export function commentableLines(patch) {
  const lines = new Map();
  if (typeof patch !== 'string') return lines;
  let hunk = -1;
  let next = 0;
  for (const raw of patch.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (header) {
      hunk += 1;
      next = Number(header[1]);
      continue;
    }
    if (hunk < 0) continue;
    const kind = raw[0];
    if (kind === '+' || kind === ' ') {
      lines.set(next, hunk);
      next += 1;
    }
    // '-' (removed) and '\' (no newline marker) do not advance the new file.
  }
  return lines;
}

/** Builds Map<path, Map<line, hunk>> from the PR files API response. */
export function diffIndex(files) {
  const index = new Map();
  for (const file of files) index.set(file.filename, commentableLines(file.patch));
  return index;
}

function commentBody(f) {
  return `**[${f.severity}] ${f.id}**\n\n${f.body}`;
}

/**
 * Splits findings into inline comments and findings moved to the review body,
 * and returns the exact payload for POST /pulls/{n}/reviews.
 * When stale is true every finding goes to the body (line numbers may no
 * longer match the PR diff).
 */
export function buildPayload(review, index, { stale = false } = {}) {
  const comments = [];
  const moved = [];
  for (const f of review.findings) {
    const lines = index.get(f.path);
    const reason = stale
      ? 'revisão feita em commit anterior ao head atual'
      : !lines
        ? 'arquivo fora do diff do PR'
        : !lines.has(f.line)
          ? 'linha fora do diff do PR'
          : null;
    if (reason) {
      moved.push({ f, reason });
      continue;
    }
    const comment = { path: f.path, line: f.line, side: 'RIGHT', body: commentBody(f) };
    if (f.start_line !== undefined && lines.get(f.start_line) === lines.get(f.line)) {
      comment.start_line = f.start_line;
      comment.start_side = 'RIGHT';
    }
    comments.push(comment);
  }
  let body = review.body.trimEnd();
  if (moved.length > 0) {
    const items = moved.map(({ f, reason }) => {
      const where = f.start_line !== undefined ? `${f.path}:${f.start_line}-${f.line}` : `${f.path}:${f.line}`;
      return `- **[${f.severity}] ${f.id}** \`${where}\` (${reason})\n\n  ${f.body.replace(/\n/g, '\n  ')}`;
    });
    body += `\n\n${OUTSIDE_HEADING}\n\n${items.join('\n')}`;
  }
  return {
    payload: { commit_id: review.commit, event: 'COMMENT', body, comments },
    inline: comments.length,
    moved: moved.length,
  };
}

function gh(args, input) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (error.code === 'ENOENT') throw new ExitError(2, 'gh não encontrado. Instale o GitHub CLI.');
    const detail = (error.stderr || error.message || '').toString().trim();
    throw new ExitError(4, `Falha ao chamar gh ${args.slice(0, 2).join(' ')}: ${detail}`);
  }
}

function fetchFiles(repo, pr) {
  const files = [];
  for (let page = 1; ; page += 1) {
    const batch = JSON.parse(gh(['api', `repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`]));
    files.push(...batch);
    if (batch.length < 100) return files;
  }
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const known = new Set(['--validate-only', '--dry-run', '--force-stale']);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (positional.length !== 1 || unknown.length > 0) {
    throw new ExitError(1, 'Uso: node post-review.mjs <review.json> [--validate-only | --dry-run] [--force-stale]');
  }
  return {
    file: positional[0],
    validateOnly: flags.has('--validate-only'),
    dryRun: flags.has('--dry-run'),
    forceStale: flags.has('--force-stale'),
  };
}

export function main(argv) {
  const { file, validateOnly, dryRun, forceStale } = parseArgs(argv);

  let review;
  try {
    review = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ExitError(1, `Não foi possível ler ${file}: ${error.message}`);
  }
  const errors = validateReview(review);
  if (errors.length > 0) throw new ExitError(1, `Arquivo de revisão inválido:\n- ${errors.join('\n- ')}`);
  if (validateOnly) {
    process.stdout.write(`${file} válido: PR #${review.pr}, ${review.findings.length} achado(s).\n`);
    return;
  }

  try {
    gh(['auth', 'status']);
  } catch (error) {
    if (error.code === 2) throw error;
    throw new ExitError(2, 'gh não está autenticado. Rode `gh auth login` e tente de novo.');
  }

  const repo = review.repo ?? gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
  const pull = JSON.parse(gh(['api', `repos/${repo}/pulls/${review.pr}`]));
  const stale = pull.head.sha !== review.commit;
  if (stale && !forceStale) {
    throw new ExitError(
      3,
      `O head do PR #${review.pr} (${pull.head.sha.slice(0, 7)}) não é o commit revisado ` +
        `(${review.commit.slice(0, 7)}). Rode a revisão de novo, ou use --force-stale ` +
        'para publicar mesmo assim (todos os achados vão para o corpo da revisão).',
    );
  }

  const { payload, inline, moved } = buildPayload(review, diffIndex(fetchFiles(repo, review.pr)), { stale });
  if (payload.body.length > MAX_BODY) {
    throw new ExitError(1, `Corpo da revisão tem ${payload.body.length} caracteres (limite ${MAX_BODY}). Encurte o body.`);
  }

  const summary =
    `PR #${review.pr} (${repo}) @ ${review.commit.slice(0, 7)}${stale ? ' [desatualizado]' : ''}: ` +
    `${inline} comentário(s) na linha, ${moved} achado(s) movido(s) para o corpo.`;

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.stderr.write(`[dry-run] ${summary}\n`);
    return;
  }

  const result = JSON.parse(
    gh(['api', '--method', 'POST', `repos/${repo}/pulls/${review.pr}/reviews`, '--input', '-'], JSON.stringify(payload)),
  );
  process.stdout.write(`${summary}\nRevisão publicada: ${result.html_url}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof ExitError ? error.code : 4);
  }
}
