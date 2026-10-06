import { createHash } from 'node:crypto';

/** A shorter value is too easy to guess, so the admin routes stay off. */
export const ADMIN_TOKEN_MIN_LENGTH = 32;

// GitHub logins: alphanumerics and hyphens, up to 39 characters.
const LOGIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

export interface AdminEntry {
  login: string;
  digest: Buffer;
}

export type ParsedAdminTokens = { admins: AdminEntry[] } | { error: string };

export function digestOf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Reads `ADMIN_API_TOKENS`: comma-separated `login:token` entries, one per
 * administrator. Returns null when nothing is configured, which keeps the
 * feature off. Any malformed or repeated entry makes the whole value invalid,
 * so a typo can never leave part of the list silently active. Errors name the
 * entry by position and never repeat a login or token.
 */
export function parseAdminTokens(
  raw: string | undefined,
): ParsedAdminTokens | null {
  if (raw === undefined || raw.trim() === '') return null;

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.length === 0) return null;

  const admins: AdminEntry[] = [];
  const logins = new Set<string>();
  const digests = new Set<string>();

  for (const [index, entry] of entries.entries()) {
    const position = index + 1;
    const separator = entry.indexOf(':');
    if (separator === -1) {
      return { error: `Entry ${position} has no login (use login:token)` };
    }

    const login = entry.slice(0, separator);
    const token = entry.slice(separator + 1);
    if (!LOGIN_PATTERN.test(login)) {
      return { error: `Entry ${position} has an invalid login` };
    }
    if (token.length < ADMIN_TOKEN_MIN_LENGTH) {
      return {
        error: `Entry ${position} has a token with fewer than ${ADMIN_TOKEN_MIN_LENGTH} characters`,
      };
    }
    if (token.includes(':')) {
      return { error: `Entry ${position} has a token with a colon` };
    }
    if (logins.has(login.toLowerCase())) {
      return { error: `Entry ${position} repeats a login` };
    }

    const digest = digestOf(token);
    if (digests.has(digest.toString('hex'))) {
      return { error: `Entry ${position} repeats a token` };
    }

    logins.add(login.toLowerCase());
    digests.add(digest.toString('hex'));
    admins.push({ login, digest });
  }

  return { admins };
}
