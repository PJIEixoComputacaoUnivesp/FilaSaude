import {
  type ExecutionContext,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard.js';

const TOKEN = 'a'.repeat(32) + 'b'.repeat(16);

function contextWith(authorization?: string | string[]): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminTokenGuard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('lets a request with the configured token through', () => {
    vi.stubEnv('ADMIN_API_TOKEN', TOKEN);

    expect(
      new AdminTokenGuard().canActivate(contextWith(`Bearer ${TOKEN}`)),
    ).toBe(true);
  });

  it('hides the routes when no token is configured', () => {
    vi.stubEnv('ADMIN_API_TOKEN', '');

    expect(() =>
      new AdminTokenGuard().canActivate(contextWith(`Bearer ${TOKEN}`)),
    ).toThrow(NotFoundException);
  });

  it('keeps the routes off for a token that is too short, and says so without printing it', () => {
    const short = 'x'.repeat(31);
    vi.stubEnv('ADMIN_API_TOKEN', short);
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const guard = new AdminTokenGuard();

    expect(() => guard.canActivate(contextWith(`Bearer ${short}`))).toThrow(
      NotFoundException,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(short);
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['a header without the Bearer scheme', TOKEN],
    ['another scheme', `Basic ${TOKEN}`],
    ['a wrong token', `Bearer ${'c'.repeat(48)}`],
    [
      'a token that is a prefix of the real one',
      `Bearer ${TOKEN.slice(0, 40)}`,
    ],
    ['a token that extends the real one', `Bearer ${TOKEN}x`],
    ['a repeated header', [`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]],
  ])('rejects %s', (_label, header) => {
    vi.stubEnv('ADMIN_API_TOKEN', TOKEN);

    expect(() =>
      new AdminTokenGuard().canActivate(contextWith(header)),
    ).toThrow(UnauthorizedException);
  });

  it('reads the token again on each request', () => {
    vi.stubEnv('ADMIN_API_TOKEN', TOKEN);
    const guard = new AdminTokenGuard();
    expect(guard.canActivate(contextWith(`Bearer ${TOKEN}`))).toBe(true);

    vi.stubEnv('ADMIN_API_TOKEN', '');

    expect(() => guard.canActivate(contextWith(`Bearer ${TOKEN}`))).toThrow(
      NotFoundException,
    );
  });
});
