import { describe, expect, it } from 'vitest';
import { allocateOrder, createOrderSchema, ORDER_MAX_ITEMS, priceOrder } from './orders.js';

const base = { pricePerPhoto: 10_000, bundlePrice: 30_000, searchMatch: true } as const;

describe('priceOrder', () => {
  it('charges per photo when there is no bundle price', () => {
    expect(priceOrder({ ...base, itemCount: 5, bundlePrice: null })).toEqual({
      subtotal: 50_000,
      total: 50_000,
      bundleApplied: false,
      bundleBlocker: 'no_bundle',
    });
  });

  it('applies the bundle when all photos came from a search and it is cheaper', () => {
    expect(priceOrder({ ...base, itemCount: 5 })).toEqual({
      subtotal: 50_000,
      total: 30_000,
      bundleApplied: true,
      bundleBlocker: null,
    });
  });

  it('does not apply the bundle when it is not cheaper (including equal)', () => {
    expect(priceOrder({ ...base, itemCount: 2 })).toMatchObject({ total: 20_000, bundleBlocker: 'not_cheaper' });
    expect(priceOrder({ ...base, itemCount: 3 })).toMatchObject({ total: 30_000, bundleApplied: false });
  });

  it('never applies the bundle without a matching search', () => {
    for (const blocker of ['no_search', 'search_expired', 'not_matched'] as const) {
      expect(priceOrder({ ...base, itemCount: 20, searchMatch: blocker })).toMatchObject({
        total: 200_000,
        bundleApplied: false,
        bundleBlocker: blocker,
      });
    }
  });

  it('handles free events', () => {
    expect(priceOrder({ ...base, itemCount: 3, pricePerPhoto: 0, bundlePrice: null }).total).toBe(0);
  });

  it('rejects invalid input', () => {
    expect(() => priceOrder({ ...base, itemCount: 0 })).toThrow(RangeError);
    expect(() => priceOrder({ ...base, itemCount: ORDER_MAX_ITEMS + 1 })).toThrow(RangeError);
    expect(() => priceOrder({ ...base, itemCount: 1.5 })).toThrow(RangeError);
    expect(() => priceOrder({ ...base, itemCount: 1, pricePerPhoto: -1 })).toThrow(RangeError);
    expect(() => priceOrder({ ...base, itemCount: 1, bundlePrice: 10.5 })).toThrow(RangeError);
  });
});

describe('allocateOrder', () => {
  it('splits single-price orders evenly', () => {
    expect(allocateOrder(20_000, [70, 70])).toEqual([
      { price: 10_000, photographerSharePct: 70, photographerAmount: 7_000, platformAmount: 3_000 },
      { price: 10_000, photographerSharePct: 70, photographerAmount: 7_000, platformAmount: 3_000 },
    ]);
  });

  it('spreads the bundle remainder one tögrög at a time', () => {
    expect(allocateOrder(10_000, [70, 70, 70]).map((i) => i.price)).toEqual([3_334, 3_333, 3_333]);
  });

  it('uses each photographer share at purchase time', () => {
    const [a, b] = allocateOrder(30_000, [70, 50]);
    expect(a).toMatchObject({ photographerAmount: 10_500, platformAmount: 4_500 });
    expect(b).toMatchObject({ photographerAmount: 7_500, platformAmount: 7_500 });
  });

  it('always sums back to the order total, per item and overall', () => {
    for (const total of [0, 1, 7, 29_999, 30_000, 1_234_567]) {
      for (const n of [1, 2, 3, 7, 13, 500]) {
        const pcts = Array.from({ length: n }, (_, i) => [70, 65, 100, 0][i % 4]!);
        const items = allocateOrder(total, pcts);
        expect(items.reduce((s, i) => s + i.price, 0)).toBe(total);
        for (const item of items) {
          expect(item.photographerAmount + item.platformAmount).toBe(item.price);
          expect(item.price).toBeGreaterThanOrEqual(0);
        }
        const prices = items.map((i) => i.price);
        expect(Math.max(...prices) - Math.min(...prices)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects empty orders and fractional totals', () => {
    expect(() => allocateOrder(1_000, [])).toThrow(RangeError);
    expect(() => allocateOrder(10.5, [70])).toThrow(RangeError);
  });
});

describe('createOrderSchema', () => {
  const id = '0190f5c2-3b1e-7c3a-9d2e-1a2b3c4d5e6f';

  it('normalizes the optional email', () => {
    const parsed = createOrderSchema.parse({ photoIds: [id], email: 'Me@Example.MN' });
    expect(parsed.email).toBe('me@example.mn');
  });

  it('rejects duplicates and empty carts', () => {
    expect(createOrderSchema.safeParse({ photoIds: [id, id] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ photoIds: [] }).success).toBe(false);
  });
});
