import { describe, expect, it } from 'vitest';
import { computeEventExpiresAt, isPurgeDue } from './retention.js';

describe('computeEventExpiresAt', () => {
  it('adds retention days to the event end', () => {
    const endsAt = new Date('2026-06-01T12:00:00Z');
    expect(computeEventExpiresAt(endsAt, 180).toISOString()).toBe('2026-11-28T12:00:00.000Z');
  });

  it('rejects invalid retention values', () => {
    const endsAt = new Date('2026-06-01T00:00:00Z');
    expect(() => computeEventExpiresAt(endsAt, 0)).toThrow(RangeError);
    expect(() => computeEventExpiresAt(endsAt, 1.5)).toThrow(RangeError);
    expect(() => computeEventExpiresAt(endsAt, 100_000)).toThrow(RangeError);
  });
});

describe('isPurgeDue', () => {
  const deletedAt = new Date('2026-09-01T00:00:00Z');

  it('is not due before 30 days', () => {
    expect(isPurgeDue(deletedAt, new Date('2026-09-30T23:59:59Z'))).toBe(false);
  });

  it('is due at exactly 30 days and after', () => {
    expect(isPurgeDue(deletedAt, new Date('2026-10-01T00:00:00Z'))).toBe(true);
    expect(isPurgeDue(deletedAt, new Date('2027-01-01T00:00:00Z'))).toBe(true);
  });
});
