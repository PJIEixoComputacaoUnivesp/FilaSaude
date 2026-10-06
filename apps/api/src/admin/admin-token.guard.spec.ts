import {
  type ExecutionContext,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard.js';
import { FailureLimiter } from './failure-limiter.js';

const MARIA = 'm'.repeat(48);
const JOAO = 'j'.repeat(48);
const LIST = `maria:${MARIA},joao:${JOAO}`;

interface FakeRequest {
  headers: { authorization?: string | string[] };
  admin?: { login: string };
}

function contextWith(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const bearer = (token: string): FakeRequest => ({
  headers: { authorization: `Bearer ${token}` },
});

describe('AdminTokenGuard', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const guard = (limiter = new FailureLimiter()) =>
    new AdminTokenGuard(limiter);

  it('attaches the login of the token that was sent', () => {
    vi.stubEnv('ADMIN_API_TOKENS', LIST);
    const maria = bearer(MARIA);
    const joao = bearer(JOAO);

    expect(guard().canActivate(contextWith(maria))).toBe(true);
    expect(guard().canActivate(contextWith(joao))).toBe(true);

    expect(maria.admin).toEqual({ login: 'maria' });
    expect(joao.admin).toEqual({ login: 'joao' });
  });

  it('never attributes a token to another administrator', () => {
    vi.stubEnv('ADMIN_API_TOKENS', LIST);
    const request = bearer(JOAO);

    guard().canActivate(contextWith(request));

    expect(request.admin?.login).not.toBe('maria');
  });

  it.each([undefined, '', '  '])(
    'hides the routes when %j is configured',
    (raw) => {
      if (raw === undefined) vi.stubEnv('ADMIN_API_TOKENS', '');
      else vi.stubEnv('ADMIN_API_TOKENS', raw);

      expect(() => guard().canActivate(contextWith(bearer(MARIA)))).toThrow(
        NotFoundException,
      );
    },
  );

  it('hides the routes when the variable was never set', () => {
    delete process.env.ADMIN_API_TOKENS;

    expect(() => guard().canActivate(contextWith(bearer(MARIA)))).toThrow(
      NotFoundException,
    );
  });

  it('keeps every route off for a malformed list and says why, without the values', () => {
    vi.stubEnv('ADMIN_API_TOKENS', `maria:${MARIA},joao:short`);
    const instance = guard();

    expect(() => instance.canActivate(contextWith(bearer(MARIA)))).toThrow(
      NotFoundException,
    );
    expect(() => instance.canActivate(contextWith(bearer(MARIA)))).toThrow(
      NotFoundException,
    );

    // Warned once, not on every request, and never with a token or login.
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('Entry 2');
    expect(logged).not.toContain(MARIA);
    expect(logged).not.toContain('joao');
  });

  it.each([
    ['no header', {}],
    ['an empty header', { authorization: '' }],
    ['no Bearer scheme', { authorization: MARIA }],
    ['another scheme', { authorization: `Basic ${MARIA}` }],
    ['a wrong token', { authorization: `Bearer ${'z'.repeat(48)}` }],
    ['a prefix of a token', { authorization: `Bearer ${MARIA.slice(0, 40)}` }],
    ['a token plus extra', { authorization: `Bearer ${MARIA}x` }],
    [
      'a repeated header',
      { authorization: [`Bearer ${MARIA}`, `Bearer ${MARIA}`] },
    ],
  ])('rejects %s', (_label, headers) => {
    vi.stubEnv('ADMIN_API_TOKENS', LIST);

    expect(() => guard().canActivate(contextWith({ headers }))).toThrow(
      UnauthorizedException,
    );
  });

  it('stops accepting a token once its entry is removed', () => {
    vi.stubEnv('ADMIN_API_TOKENS', LIST);
    const instance = guard();
    expect(instance.canActivate(contextWith(bearer(JOAO)))).toBe(true);

    vi.stubEnv('ADMIN_API_TOKENS', `maria:${MARIA}`);

    expect(() => instance.canActivate(contextWith(bearer(JOAO)))).toThrow(
      UnauthorizedException,
    );
    expect(instance.canActivate(contextWith(bearer(MARIA)))).toBe(true);
  });

  describe('failed attempts', () => {
    it('refuses invalid attempts past the limit with 429, but never a valid token', () => {
      vi.stubEnv('ADMIN_API_TOKENS', LIST);
      const limiter = new FailureLimiter();
      const instance = guard(limiter);
      const wrong = () => contextWith(bearer('w'.repeat(48)));

      for (let i = 0; i < limiter.limit - 1; i++) {
        expect(() => instance.canActivate(wrong())).toThrow(
          UnauthorizedException,
        );
      }
      const blocked = (() => {
        try {
          instance.canActivate(wrong());
        } catch (error) {
          return error as HttpException;
        }
      })();

      expect(blocked).toBeInstanceOf(HttpException);
      expect(blocked!.getStatus()).toBe(429);
      expect(() => instance.canActivate(wrong())).toThrow(HttpException);
      // The administrators are not locked out.
      expect(instance.canActivate(contextWith(bearer(MARIA)))).toBe(true);
      expect(instance.canActivate(contextWith(bearer(JOAO)))).toBe(true);
    });

    it('does not count a valid token as a failure', () => {
      vi.stubEnv('ADMIN_API_TOKENS', LIST);
      const limiter = new FailureLimiter();
      const instance = guard(limiter);

      for (let i = 0; i < limiter.limit * 2; i++) {
        instance.canActivate(contextWith(bearer(MARIA)));
      }

      expect(limiter.isBlocked()).toBe(false);
    });

    it('logs failures in aggregate, without the token', () => {
      vi.stubEnv('ADMIN_API_TOKENS', LIST);
      const limiter = new FailureLimiter();
      const instance = guard(limiter);
      const sent = 'q'.repeat(48);

      for (let i = 0; i < limiter.limit + 15; i++) {
        try {
          instance.canActivate(contextWith(bearer(sent)));
        } catch {
          // expected
        }
      }

      // The first failure and the one that reaches the limit, not each one.
      expect(warn).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(sent);
    });
  });
});
