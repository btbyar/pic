import { describe, expect, it } from 'vitest';
import { evaluateAccess, isActingAdmin, isMfaRequired, type Principal, type RouteAccess } from './access-policy';

const route = (over: Partial<RouteAccess> = {}): RouteAccess => ({
  isPublic: false,
  roles: null,
  allowPendingMfa: false,
  allowUnapproved: false,
  ...over,
});

const photographer = (over: Partial<Principal> = {}): Principal => ({
  userId: 'u1',
  role: 'PHOTOGRAPHER',
  status: 'APPROVED',
  mfaRequired: false,
  mfaPassed: false,
  ...over,
});

const admin = (over: Partial<Principal> = {}): Principal => ({
  userId: 'a1',
  role: 'ADMIN',
  status: 'APPROVED',
  mfaRequired: true,
  mfaPassed: true,
  ...over,
});

const code = (d: ReturnType<typeof evaluateAccess>) => (d.allow ? 'allow' : d.code);

describe('evaluateAccess', () => {
  it('allows public routes without a session', () => {
    expect(code(evaluateAccess(route({ isPublic: true }), null))).toBe('allow');
  });

  it('closes every non-public route by default', () => {
    expect(evaluateAccess(route(), null)).toEqual({ allow: false, status: 401, code: 'unauthenticated' });
  });

  it('blocks suspended and rejected accounts everywhere except public routes', () => {
    for (const status of ['SUSPENDED', 'REJECTED'] as const) {
      expect(code(evaluateAccess(route({ allowUnapproved: true, allowPendingMfa: true }), photographer({ status })))).toBe(
        'account_inactive',
      );
    }
  });

  it('requires 2FA for admins before anything else', () => {
    const pending = admin({ mfaPassed: false });
    expect(code(evaluateAccess(route({ roles: ['ADMIN'] }), pending))).toBe('mfa_required');
    expect(code(evaluateAccess(route({ allowPendingMfa: true }), pending))).toBe('allow');
    expect(code(evaluateAccess(route({ roles: ['ADMIN'] }), admin()))).toBe('allow');
  });

  it('keeps pending photographers out of photographer routes', () => {
    const pending = photographer({ status: 'PENDING' });
    expect(code(evaluateAccess(route({ roles: ['PHOTOGRAPHER'] }), pending))).toBe('account_pending');
    expect(code(evaluateAccess(route({ allowUnapproved: true }), pending))).toBe('allow');
  });

  it('enforces roles', () => {
    expect(code(evaluateAccess(route({ roles: ['ADMIN'] }), photographer()))).toBe('forbidden');
    expect(code(evaluateAccess(route({ roles: ['PHOTOGRAPHER'] }), admin()))).toBe('forbidden');
    expect(code(evaluateAccess(route({ roles: ['PHOTOGRAPHER', 'ADMIN'] }), admin()))).toBe('allow');
  });

  it('applies opt-in 2FA for photographers who enabled it', () => {
    const p = photographer({ mfaRequired: true, mfaPassed: false });
    expect(code(evaluateAccess(route({ roles: ['PHOTOGRAPHER'] }), p))).toBe('mfa_required');
  });
});

describe('isMfaRequired', () => {
  it('is always true for admins and opt-in for photographers', () => {
    expect(isMfaRequired('ADMIN', false)).toBe(true);
    expect(isMfaRequired('PHOTOGRAPHER', false)).toBe(false);
    expect(isMfaRequired('PHOTOGRAPHER', true)).toBe(true);
  });

  it('lets development switch off mandatory admin 2FA only', () => {
    expect(isMfaRequired('ADMIN', false, false)).toBe(false);
    expect(isMfaRequired('ADMIN', true, false)).toBe(false);
    // Зурагчны сайн дурын 2FA-д нөлөөлөхгүй
    expect(isMfaRequired('PHOTOGRAPHER', true, false)).toBe(true);
  });
});

describe('isActingAdmin', () => {
  it('requires a passed 2FA only when it is required', () => {
    expect(isActingAdmin(admin({ mfaRequired: true, mfaPassed: false }))).toBe(false);
    expect(isActingAdmin(admin({ mfaRequired: true, mfaPassed: true }))).toBe(true);
    expect(isActingAdmin(admin({ mfaRequired: false, mfaPassed: false }))).toBe(true);
    expect(isActingAdmin(photographer())).toBe(false);
    expect(isActingAdmin(null)).toBe(false);
  });
});
