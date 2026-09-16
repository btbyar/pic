import { type CanActivate, type ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@pic/shared';
import { evaluateAccess, type RouteAccess } from './access-policy';
import { AuthService } from './auth.service';
import { SESSION_COOKIE } from './cookie';
import { ALLOW_PENDING_MFA, ALLOW_UNAPPROVED, type AuthedRequest, IS_PUBLIC, ROLES } from './decorators';

/** Global guard (APP_GUARD): бүх route default-аар хаалттай. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const flag = (key: string) => this.reflector.getAllAndOverride<boolean>(key, targets) ?? false;
    const route: RouteAccess = {
      isPublic: flag(IS_PUBLIC),
      roles: this.reflector.getAllAndOverride<Role[]>(ROLES, targets) ?? null,
      allowPendingMfa: flag(ALLOW_PENDING_MFA),
      allowUnapproved: flag(ALLOW_UNAPPROVED),
    };

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    // Public route дээр ч session байвал уншина (ж: эзэмшигч өөрийн нуусан эвэнтийг харах)
    req.auth = typeof token === 'string' && token.length > 0 ? ((await this.auth.resolveSession(token)) ?? undefined) : undefined;

    const decision = evaluateAccess(route, req.auth ?? null);
    if (!decision.allow) {
      throw new HttpException({ statusCode: decision.status, code: decision.code }, decision.status);
    }
    return true;
  }
}
