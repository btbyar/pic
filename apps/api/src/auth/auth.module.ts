import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from '../audit/audit.service';
import { RateLimiter } from '../common/rate-limiter';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuditService, RateLimiter, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, AuditService, RateLimiter],
})
export class AuthModule {}
