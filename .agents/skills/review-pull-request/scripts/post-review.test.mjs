// Run with: node --test .agents/skills/review-pull-request/scripts/post-review.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPayload, commentableLines, diffIndex, validateReview } from './post-review.mjs';

const SHA = 'a'.repeat(40);
const PATCH = [
  '@@ -1,3 +1,4 @@',
  ' keep1',
  '-old2',
  '+new2',
  '+new3',
  ' keep4',
  '@@ -10,2 +11,2 @@ function x() {',
  ' keep11',
  '-old',
  '+new12',
  '\\ No newline at end of file',
].join('\n');

const review = (findings) => ({ version: 1, pr: 7, commit: SHA, body: '## Revisão', findings });
const finding = (extra) => ({ id: 'BUG-1', path: 'a.ts', line: 2, severity: 'importante', body: 'x', ...extra });

test('commentableLines maps added and context lines to their hunk', () => {
  const lines = commentableLines(PATCH);
  assert.deepEqual([...lines.entries()], [[1, 0], [2, 0], [3, 0], [4, 0], [11, 1], [12, 1]]);
});

test('commentableLines handles missing patch (binary or too large)', () => {
  assert.equal(commentableLines(undefined).size, 0);
});

test('findings inside the diff become inline RIGHT-side comments', () => {
  const index = diffIndex([{ filename: 'a.ts', patch: PATCH }]);
  const { payload, inline, moved } = buildPayload(review([finding({ start_line: 1, line: 3 })]), index);
  assert.equal(inline, 1);
  assert.equal(moved, 0);
  assert.equal(payload.event, 'COMMENT');
  assert.equal(payload.commit_id, SHA);
  assert.deepEqual(payload.comments[0], {
    path: 'a.ts',
    line: 3,
    side: 'RIGHT',
    start_line: 1,
    start_side: 'RIGHT',
    body: '**[importante] BUG-1**\n\nx',
  });
});

test('a range spanning two hunks falls back to a single-line comment', () => {
  const index = diffIndex([{ filename: 'a.ts', patch: PATCH }]);
  const { payload } = buildPayload(review([finding({ start_line: 4, line: 11 })]), index);
  assert.equal(payload.comments[0].start_line, undefined);
  assert.equal(payload.comments[0].line, 11);
});

test('findings outside the diff move to the body instead of failing', () => {
  const index = diffIndex([{ filename: 'a.ts', patch: PATCH }]);
  const { payload, inline, moved } = buildPayload(
    review([finding({ line: 8 }), finding({ id: 'SEG-1', path: 'b.ts' })]),
    index,
  );
  assert.equal(inline, 0);
  assert.equal(moved, 2);
  assert.match(payload.body, /### Achados fora do diff do PR/);
  assert.match(payload.body, /`a\.ts:8` \(linha fora do diff do PR\)/);
  assert.match(payload.body, /`b\.ts:2` \(arquivo fora do diff do PR\)/);
});

test('stale reviews move every finding to the body', () => {
  const index = diffIndex([{ filename: 'a.ts', patch: PATCH }]);
  const { inline, moved } = buildPayload(review([finding()]), index, { stale: true });
  assert.equal(inline, 0);
  assert.equal(moved, 1);
});

test('validateReview rejects bad input and accepts a valid file', () => {
  assert.deepEqual(validateReview(review([finding()])), []);
  const errors = validateReview({ version: 1, pr: 0, commit: 'abc', body: '', findings: [{ line: 2, start_line: 3 }] });
  assert.ok(errors.length >= 6, errors.join('\n'));
  assert.ok(validateReview(review([finding({ severity: 'sugestao' })])).some((e) => e.includes('severity')));
});
