import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/** A shorter value is too easy to guess, so the endpoints stay off. */
export const ADMIN_TOKEN_MIN_LENGTH = 32;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Restricts a route to administrators, who hold the static token configured in
 * `ADMIN_API_TOKEN` and send it as `Authorization: Bearer <token>`. Without a
 * valid token configured the routes do not exist (404), so the feature is off
 * until someone deliberately turns it on. The token is read on every request
 * and never logged.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor() {
    const configured = process.env.ADMIN_API_TOKEN;
    if (configured && configured.length < ADMIN_TOKEN_MIN_LENGTH) {
      new Logger(AdminTokenGuard.name).warn(
        `ADMIN_API_TOKEN has fewer than ${ADMIN_TOKEN_MIN_LENGTH} characters, so the admin endpoints stay disabled`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.ADMIN_API_TOKEN;
    if (!configured || configured.length < ADMIN_TOKEN_MIN_LENGTH) {
      throw new NotFoundException();
    }

    const { headers } = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const authorization = headers.authorization;
    const supplied =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

    // Digests have the same length, which timingSafeEqual requires, and keep
    // the length of the real token from leaking.
    if (!timingSafeEqual(digest(supplied), digest(configured))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
