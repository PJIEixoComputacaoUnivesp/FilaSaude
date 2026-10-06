import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type AdminEntry,
  digestOf,
  parseAdminTokens,
  type ParsedAdminTokens,
} from './admin-tokens.js';
import { FailureLimiter } from './failure-limiter.js';

/**
 * Restricts a route to administrators. Each one holds a token listed in
 * `ADMIN_API_TOKENS` under their login and sends it as
 * `Authorization: Bearer <token>`. The guard attaches the login to the
 * request, so the actor of an action comes from the token and not from
 * anything the caller writes. There is a single level of access and no route
 * that manages administrators: they exist only through that secret.
 *
 * Without a valid configuration the routes do not exist (404), so the feature
 * is off until someone turns it on, and a malformed list keeps it off. The
 * value is read on every request and never logged.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly logger = new Logger(AdminTokenGuard.name);
  private parsed?: { raw: string | undefined; value: ParsedAdminTokens | null };

  constructor(private readonly limiter: FailureLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = this.configuration();
    if (!configured || 'error' in configured) throw new NotFoundException();

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      admin?: { login: string };
    }>();
    const authorization = request.headers.authorization;
    // The scheme name is case-insensitive (RFC 7235).
    const supplied =
      typeof authorization === 'string'
        ? (/^Bearer\s+(\S+)\s*$/i.exec(authorization)?.[1] ?? '')
        : '';

    const admin = this.authenticate(configured.admins, supplied);
    if (admin) {
      request.admin = { login: admin.login };
      return true;
    }

    this.recordFailure();
    if (this.limiter.isBlocked()) {
      throw new HttpException(
        'Too many failed attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new UnauthorizedException();
  }

  /** Checks every entry, so the time taken does not tell which one is close. */
  private authenticate(
    admins: readonly AdminEntry[],
    supplied: string,
  ): AdminEntry | undefined {
    const digest = digestOf(supplied);
    let matched: AdminEntry | undefined;
    for (const admin of admins) {
      if (timingSafeEqual(digest, admin.digest)) matched = admin;
    }
    return matched;
  }

  /**
   * Failures are logged in aggregate, the first of a window and the one that
   * reaches the limit, so an attacker cannot flood the log. They are never
   * written to the database for the same reason. The state lives in the
   * limiter, which is shared, because Nest builds one guard per module that
   * uses it.
   */
  private recordFailure(): void {
    const count = this.limiter.record();
    if (count === 1) {
      this.logger.warn('Admin request with an invalid token');
    } else if (this.limiter.announceBlock()) {
      this.logger.warn(
        `${count} failed admin attempts in the window; invalid attempts are now refused`,
      );
    }
  }

  private configuration(): ParsedAdminTokens | null {
    const raw = process.env.ADMIN_API_TOKENS;
    // `parsed` starts out unset, which must not count as a match for an unset
    // variable: both are undefined.
    if (this.parsed && this.parsed.raw === raw) return this.parsed.value;

    const value = parseAdminTokens(raw);
    this.parsed = { raw, value };
    // Keyed by a digest, so the value itself is never kept as a key.
    if (
      value &&
      'error' in value &&
      this.limiter.firstTime(`config:${digestOf(raw ?? '').toString('hex')}`)
    ) {
      this.logger.warn(
        `ADMIN_API_TOKENS is invalid, so the admin endpoints stay disabled: ${value.error}`,
      );
    }
    return value;
  }
}
