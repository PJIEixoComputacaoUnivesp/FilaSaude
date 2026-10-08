import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { AdminLogin } from './admin.decorator.js';
import { AdminTokenGuard } from './admin-token.guard.js';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  /** Who the token belongs to. The admin page uses it to validate a token. */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@AdminLogin() login: string): { login: string } {
    return { login };
  }
}
