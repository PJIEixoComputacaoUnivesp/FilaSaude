import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { FailureLimiter } from './failure-limiter.js';

@Module({
  controllers: [AdminController],
  providers: [
    AdminTokenGuard,
    { provide: FailureLimiter, useFactory: () => new FailureLimiter() },
  ],
  exports: [AdminTokenGuard, FailureLimiter],
})
export class AdminModule {}
