import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** The login of the administrator the guard authenticated. */
export const AdminLogin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ admin?: { login: string } }>();
    if (!request.admin) {
      // Only reachable if a route forgets the guard.
      throw new Error('AdminLogin used on a route without the admin guard');
    }
    return request.admin.login;
  },
);
