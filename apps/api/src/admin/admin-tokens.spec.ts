import { parseAdminTokens } from './admin-tokens.js';

const A = 'a'.repeat(32);
const B = 'b'.repeat(40);

describe('parseAdminTokens', () => {
  it.each([undefined, '', '   ', ',', ' , ,'])(
    'treats %j as not configured',
    (raw) => {
      expect(parseAdminTokens(raw)).toBeNull();
    },
  );

  it('reads one login:token entry per administrator', () => {
    const parsed = parseAdminTokens(`maria-souza:${A},joao:${B}`);

    expect(parsed).toMatchObject({
      admins: [{ login: 'maria-souza' }, { login: 'joao' }],
    });
  });

  it('tolerates spaces and a trailing comma', () => {
    const parsed = parseAdminTokens(` maria : ${A} ,\n joao:${B}, `);

    // Spaces around the colon would change the token, so they are not allowed.
    expect(parsed).toHaveProperty('error');
    expect(parseAdminTokens(` maria:${A} ,\n joao:${B}, `)).toMatchObject({
      admins: [{ login: 'maria' }, { login: 'joao' }],
    });
  });

  it.each([
    ['a bare token', A, 'Entry 1 has no login'],
    ['an empty login', `:${A}`, 'invalid login'],
    ['a login with a space', `ma ria:${A}`, 'invalid login'],
    ['a login starting with a hyphen', `-maria:${A}`, 'invalid login'],
    ['a login that is too long', `${'x'.repeat(40)}:${A}`, 'invalid login'],
    ['a short token', `maria:${'a'.repeat(31)}`, 'fewer than 32'],
    ['an empty token', 'maria:', 'fewer than 32'],
    ['a colon in the token', `maria:${A}:${A}`, 'colon'],
    ['a repeated login', `maria:${A},maria:${B}`, 'Entry 2 repeats a login'],
    [
      'a login repeated in another case',
      `maria:${A},MARIA:${B}`,
      'repeats a login',
    ],
    ['a repeated token', `maria:${A},joao:${A}`, 'Entry 2 repeats a token'],
  ])('rejects %s', (_label, raw, message) => {
    const parsed = parseAdminTokens(raw);

    expect(parsed).toHaveProperty('error');
    expect((parsed as { error: string }).error).toContain(message);
  });

  it('rejects the whole list when one entry is bad, so none stays active', () => {
    expect(parseAdminTokens(`maria:${A},joao:short`)).toHaveProperty('error');
  });

  it('never repeats a login or token in an error', () => {
    const secret = 's3cr3t'.repeat(8);
    const parsed = parseAdminTokens(`maria:${secret}:${secret}`) as {
      error: string;
    };

    expect(parsed.error).not.toContain('s3cr3t');
    expect(parsed.error).not.toContain('maria');
  });
});
