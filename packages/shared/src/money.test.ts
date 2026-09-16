import { describe, expect, it } from 'vitest';
import { splitRevenue } from './money.js';

describe('splitRevenue', () => {
  it('splits 70/30 exactly when divisible', () => {
    expect(splitRevenue(10_000, 70)).toEqual({ photographerAmount: 7_000, platformAmount: 3_000 });
  });

  it('rounds photographer share down and gives the remainder to the platform', () => {
    // 3333 * 0.7 = 2333.1
    expect(splitRevenue(3_333, 70)).toEqual({ photographerAmount: 2_333, platformAmount: 1_000 });
  });

  it('always sums back to the price', () => {
    for (const price of [0, 1, 99, 4_999, 12_345, 1_000_001]) {
      for (const pct of [0, 1, 33, 50, 70, 99, 100]) {
        const { photographerAmount, platformAmount } = splitRevenue(price, pct);
        expect(photographerAmount + platformAmount).toBe(price);
        expect(photographerAmount).toBeGreaterThanOrEqual(0);
        expect(platformAmount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('handles 0% and 100%', () => {
    expect(splitRevenue(5_000, 0)).toEqual({ photographerAmount: 0, platformAmount: 5_000 });
    expect(splitRevenue(5_000, 100)).toEqual({ photographerAmount: 5_000, platformAmount: 0 });
  });

  it('rejects fractional prices and out-of-range percentages', () => {
    expect(() => splitRevenue(10.5, 70)).toThrow(RangeError);
    expect(() => splitRevenue(-1, 70)).toThrow(RangeError);
    expect(() => splitRevenue(1_000, 101)).toThrow(RangeError);
    expect(() => splitRevenue(1_000, 70.5)).toThrow(RangeError);
  });
});
