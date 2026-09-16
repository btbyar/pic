import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@pic/shared';
import type { Request } from 'express';
import type { Principal } from './access-policy';

export const IS_PUBLIC = 'auth:isPublic';
export const ROLES = 'auth:roles';
export const ALLOW_PENDING_MFA = 'auth:allowPendingMfa';
export const ALLOW_UNAPPROVED = 'auth:allowUnapproved';

/** Нэвтрэлтгүй хандах route */
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);
export const AllowUnapproved = () => SetMetadata(ALLOW_UNAPPROVED, true);

export interface AuthContext extends Principal {
  sessionId: string;
  email: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

/** Controller параметр: нэвтэрсэн хэрэглэгч (guard баталгаажуулсан) */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new Error('CurrentUser used on a route without an authenticated session');
  return auth;
});
