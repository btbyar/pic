import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../common/crypto';
import { canViewEvent, type VisibilityTarget, type Viewer } from './event-visibility';

const now = new Date('2026-09-16T00:00:00Z');
const token = 'secret-link-token';

const event = (over: Partial<VisibilityTarget> = {}): VisibilityTarget => ({
  visibility: 'PUBLIC',
  accessTokenHash: null,
  expiresAt: new Date('2027-01-01T00:00:00Z'),
  deletedAt: null,
  ...over,
});
const anonymous: Viewer = { isMember: false, isAdmin: false };

describe('canViewEvent', () => {
  it('shows public events to everyone', () => {
    expect(canViewEvent(event(), anonymous, now)).toBe(true);
  });

  it('shows unlisted events only with the right link token', () => {
    const unlisted = event({ visibility: 'UNLISTED', accessTokenHash: sha256Hex(token) });
    expect(canViewEvent(unlisted, anonymous, now)).toBe(false);
    expect(canViewEvent(unlisted, { ...anonymous, accessToken: 'wrong' }, now)).toBe(false);
    expect(canViewEvent(unlisted, { ...anonymous, accessToken: '' }, now)).toBe(false);
    expect(canViewEvent(unlisted, { ...anonymous, accessToken: token }, now)).toBe(true);
  });

  it('never shows hidden events to outsiders, even with a token', () => {
    const hidden = event({ visibility: 'HIDDEN', accessTokenHash: sha256Hex(token) });
    expect(canViewEvent(hidden, { ...anonymous, accessToken: token }, now)).toBe(false);
    expect(canViewEvent(hidden, { ...anonymous, isMember: true }, now)).toBe(true);
    expect(canViewEvent(hidden, { ...anonymous, isAdmin: true }, now)).toBe(true);
  });

  it('hides deleted and expired events from everyone including members', () => {
    const member: Viewer = { isMember: true, isAdmin: true };
    expect(canViewEvent(event({ deletedAt: now }), member, now)).toBe(false);
    expect(canViewEvent(event({ expiresAt: now }), member, now)).toBe(false);
  });
});
