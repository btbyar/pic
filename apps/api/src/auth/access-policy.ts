import type { Role, UserStatus } from '@pic/shared';

/** Route дээрх decorator-уудаас цуглуулсан шаардлага */
export interface RouteAccess {
  isPublic: boolean;
  roles: readonly Role[] | null;
  /** Админ 2FA хийхээс өмнө хандаж болох route (mfa setup/verify, me, logout) */
  allowPendingMfa: boolean;
  /** Батлагдаагүй зурагчин хандаж болох route (me, logout, профайл) */
  allowUnapproved: boolean;
}

export interface Principal {
  userId: string;
  role: Role;
  status: UserStatus;
  mfaRequired: boolean;
  mfaPassed: boolean;
}

export type AccessDecision =
  | { allow: true }
  | { allow: false; status: 401 | 403; code: 'unauthenticated' | 'account_inactive' | 'mfa_required' | 'account_pending' | 'forbidden' };

/**
 * Хүсэлтийг зөвшөөрөх эсэх. Default нь хаалттай: @Public() тэмдэглээгүй бол нэвтрэлт заавал.
 * Дарааллын ач холбогдол: идэвхгүй бүртгэл → 2FA → батлалт → role.
 */
export function evaluateAccess(route: RouteAccess, principal: Principal | null): AccessDecision {
  if (route.isPublic) return { allow: true };
  if (!principal) return { allow: false, status: 401, code: 'unauthenticated' };

  if (principal.status === 'SUSPENDED' || principal.status === 'REJECTED') {
    return { allow: false, status: 403, code: 'account_inactive' };
  }
  if (principal.mfaRequired && !principal.mfaPassed && !route.allowPendingMfa) {
    return { allow: false, status: 403, code: 'mfa_required' };
  }
  if (principal.status === 'PENDING' && !route.allowUnapproved) {
    return { allow: false, status: 403, code: 'account_pending' };
  }
  if (route.roles && !route.roles.includes(principal.role)) {
    return { allow: false, status: 403, code: 'forbidden' };
  }
  return { allow: true };
}

/** Админд 2FA үргэлж заавал; бусад нь идэвхжүүлсэн бол заавал. */
export function isMfaRequired(role: Role, totpEnabled: boolean): boolean {
  return role === 'ADMIN' || totpEnabled;
}
