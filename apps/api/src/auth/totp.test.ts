import { generateSync } from 'otplib';
import { describe, expect, it } from 'vitest';
import { checkTotp, newTotpSecret, totpUri } from './totp';

const now = Date.UTC(2026, 8, 16, 12, 0, 15);
const codeAt = (secret: string, ms: number) => generateSync({ secret, epoch: Math.floor(ms / 1000), period: 30 });

describe('checkTotp', () => {
  const secret = newTotpSecret();

  it('accepts the current code and reports its step', () => {
    const result = checkTotp(secret, codeAt(secret, now), null, now);
    expect(result).toEqual({ ok: true, step: Math.floor(now / 1000 / 30) });
  });

  it('tolerates one step of clock drift but not more', () => {
    expect(checkTotp(secret, codeAt(secret, now - 30_000), null, now).ok).toBe(true);
    expect(checkTotp(secret, codeAt(secret, now - 120_000), null, now).ok).toBe(false);
  });

  it('rejects a replayed code (same or earlier step)', () => {
    const code = codeAt(secret, now);
    const first = checkTotp(secret, code, null, now);
    expect(first.ok).toBe(true);
    const step = (first as { step: number }).step;
    expect(checkTotp(secret, code, step, now + 5_000).ok).toBe(false);
    expect(checkTotp(secret, codeAt(secret, now - 30_000), step, now).ok).toBe(false);
  });

  it('rejects malformed codes and codes for other secrets', () => {
    expect(checkTotp(secret, '12345', null, now).ok).toBe(false);
    expect(checkTotp(secret, 'abcdef', null, now).ok).toBe(false);
    expect(checkTotp(secret, codeAt(newTotpSecret(), now), null, now).ok).toBe(false);
  });

  it('builds an otpauth URI for authenticator apps', () => {
    expect(totpUri(secret, 'admin@pic.local')).toMatch(/^otpauth:\/\/totp\/Pic:admin%40pic\.local\?.*secret=/);
  });
});
