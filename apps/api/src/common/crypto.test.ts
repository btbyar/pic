import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FieldCipher, hashIp, randomToken, safeEqualHex, sha256Hex } from './crypto';

const key = randomBytes(32).toString('base64');

describe('FieldCipher', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const cipher = new FieldCipher(key);
    const a = cipher.encrypt('JBSWY3DPEHPK3PXP');
    const b = cipher.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
    expect(cipher.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampered ciphertext', () => {
    const cipher = new FieldCipher(key);
    const parts = cipher.encrypt('secret').split('.');
    const body = Buffer.from(parts[3]!, 'base64url');
    body[0] = body[0]! ^ 0xff;
    parts[3] = body.toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('rejects decryption with a different key', () => {
    const payload = new FieldCipher(key).encrypt('secret');
    expect(() => new FieldCipher(randomBytes(32).toString('base64')).decrypt(payload)).toThrow();
  });

  it('refuses keys that are not 32 bytes', () => {
    expect(() => new FieldCipher(randomBytes(16).toString('base64'))).toThrow();
  });
});

describe('hashing helpers', () => {
  it('hashIp is stable per secret and does not contain the IP', () => {
    const h = hashIp('203.0.113.7', 'x'.repeat(32));
    expect(h).toBe(hashIp('203.0.113.7', 'x'.repeat(32)));
    expect(h).not.toBe(hashIp('203.0.113.7', 'y'.repeat(32)));
    expect(h).not.toContain('203');
  });

  it('randomToken has 256 bits of entropy by default', () => {
    expect(Buffer.from(randomToken(), 'base64url')).toHaveLength(32);
  });

  it('safeEqualHex compares hashes', () => {
    expect(safeEqualHex(sha256Hex('a'), sha256Hex('a'))).toBe(true);
    expect(safeEqualHex(sha256Hex('a'), sha256Hex('b'))).toBe(false);
    expect(safeEqualHex('ab', 'abcd')).toBe(false);
  });
});
