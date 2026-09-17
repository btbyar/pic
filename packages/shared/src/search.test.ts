import { describe, expect, it } from 'vitest';
import { classifyMatches, pickExpansionSeeds, removalRequestSchema } from './search.js';

const t = { high: 0.45, low: 0.4 };
const map = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('classifyMatches', () => {
  it('splits direct matches into mine and maybe at the thresholds (inclusive)', () => {
    const result = classifyMatches(map({ a: 0.8, b: 0.45, c: 0.44, d: 0.4, e: 0.399 }), new Map(), t);
    expect(result.mine).toEqual(['a', 'b']);
    expect(result.maybe).toEqual(['c', 'd']);
  });

  it('adds strong expansion matches to maybe only, never to mine', () => {
    const result = classifyMatches(map({ a: 0.7, x: 0.2 }), map({ a: 0.9, x: 0.6, y: 0.5 }), t);
    expect(result.mine).toEqual(['a']);
    expect(result.maybe.sort()).toEqual(['x', 'y']);
  });

  it('ignores weak expansion matches', () => {
    expect(classifyMatches(map({ a: 0.7 }), map({ z: 0.44 }), t).maybe).toEqual([]);
  });

  it('orders maybe by the strongest direct evidence', () => {
    const result = classifyMatches(map({ a: 0.7, low: 0.41, mid: 0.43 }), map({ exp: 0.5 }), t);
    expect(result.maybe).toEqual(['mid', 'low', 'exp']);
  });

  it('rejects inverted thresholds', () => {
    expect(() => classifyMatches(new Map(), new Map(), { high: 0.3, low: 0.4 })).toThrow(RangeError);
  });
});

describe('pickExpansionSeeds', () => {
  it('takes the top-K most confident matches', () => {
    const seeds = pickExpansionSeeds([{ score: 0.5 }, { score: 0.9 }, { score: 0.7 }], 2);
    expect(seeds.map((s) => s.score)).toEqual([0.9, 0.7]);
    expect(pickExpansionSeeds([{ score: 0.5 }], 0)).toEqual([]);
  });
});

describe('schemas', () => {
  it('validates removal requests', () => {
    expect(removalRequestSchema.safeParse({ reason: 'ME_IN_PHOTO' }).success).toBe(true);
    expect(removalRequestSchema.safeParse({ reason: 'SPAM' }).success).toBe(false);
    expect(removalRequestSchema.safeParse({ reason: 'OTHER', message: 'x'.repeat(1001) }).success).toBe(false);
  });
});
