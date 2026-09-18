import { describe, expect, it } from 'vitest';
import { buildLedger, isClosedPeriod, maskAccount, nextPeriod, payoutPeriod, refundAmount } from './payouts.js';

describe('periods', () => {
  it('uses Ulaanbaatar time for month boundaries', () => {
    // 2026-09-30 16:30 UTC = 2026-10-01 00:30 UB
    expect(payoutPeriod(new Date('2026-09-30T16:30:00Z'))).toBe('2026-10');
    expect(payoutPeriod(new Date('2026-09-30T15:59:59Z'))).toBe('2026-09');
  });

  it('rolls over years and knows closed months', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01');
    expect(nextPeriod('2026-09')).toBe('2026-10');
    const now = new Date('2026-09-18T00:00:00Z');
    expect(isClosedPeriod('2026-08', now)).toBe(true);
    expect(isClosedPeriod('2026-09', now)).toBe(false);
  });
});

describe('buildLedger', () => {
  it('pays each month its own sales minus refunds made that month', () => {
    const rows = buildLedger([
      { period: '2026-08', gross: 70_000, refunded: 0 },
      { period: '2026-09', gross: 35_000, refunded: 7_000 },
    ]);
    expect(rows).toEqual([
      { period: '2026-08', gross: 70_000, refunded: 0, carriedIn: 0, net: 70_000, payable: 70_000 },
      { period: '2026-09', gross: 35_000, refunded: 7_000, carriedIn: 0, net: 28_000, payable: 28_000 },
    ]);
  });

  it('carries a deficit forward, through quiet months, until earnings cover it', () => {
    const rows = buildLedger([
      { period: '2026-07', gross: 10_000, refunded: 0 },
      { period: '2026-08', gross: 0, refunded: 25_000 },
      { period: '2026-10', gross: 8_000, refunded: 0 },
      { period: '2026-11', gross: 20_000, refunded: 0 },
    ]);
    expect(rows.map((r) => [r.period, r.carriedIn, r.net, r.payable])).toEqual([
      ['2026-07', 0, 10_000, 10_000],
      ['2026-08', 0, -25_000, 0],
      ['2026-09', -25_000, -25_000, 0],
      ['2026-10', -25_000, -17_000, 0],
      ['2026-11', -17_000, 3_000, 3_000],
    ]);
  });

  it('balances exactly: total paid out + outstanding deficit = earnings − refunds', () => {
    const activity = [
      { period: '2026-01', gross: 5_000, refunded: 0 },
      { period: '2026-02', gross: 1_000, refunded: 9_000 },
      { period: '2026-03', gross: 12_000, refunded: 1_000 },
      { period: '2026-04', gross: 0, refunded: 2_000 },
      { period: '2026-05', gross: 4_000, refunded: 0 },
    ];
    const rows = buildLedger(activity);
    const payable = rows.reduce((s, r) => s + r.payable, 0);
    const earned = activity.reduce((s, a) => s + a.gross - a.refunded, 0);
    const outstanding = Math.min(0, rows.at(-1)!.net);
    expect(payable + outstanding).toBe(earned);
    expect(rows.every((r) => r.payable >= 0)).toBe(true);
  });

  it('merges duplicate periods and rejects bad input', () => {
    expect(buildLedger([
      { period: '2026-09', gross: 1_000, refunded: 0 },
      { period: '2026-09', gross: 2_000, refunded: 500 },
    ])[0]).toMatchObject({ gross: 3_000, refunded: 500, net: 2_500 });
    expect(buildLedger([])).toEqual([]);
    expect(() => buildLedger([{ period: '2026-13', gross: 0, refunded: 0 }])).toThrow(RangeError);
    expect(() => buildLedger([{ period: '2026-09', gross: -1, refunded: 0 }])).toThrow(RangeError);
  });
});

describe('refunds and accounts', () => {
  it('refunds exactly what was paid for the chosen photos', () => {
    expect(refundAmount([{ price: 3_334 }, { price: 3_333 }])).toBe(6_667);
    expect(refundAmount([])).toBe(0);
  });

  it('masks bank account numbers', () => {
    expect(maskAccount('5012345678')).toBe('••••5678');
  });
});
