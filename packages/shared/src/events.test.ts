import { describe, expect, it } from 'vitest';
import { createEventSchema, SLUG_MAX_LENGTH, slugify, updateEventSchema } from './events.js';

describe('slugify', () => {
  it('transliterates Mongolian Cyrillic', () => {
    expect(slugify('Туул голын трейл гүйлт 2026')).toBe('tuul-golyn-treil-guilt-2026');
    expect(slugify('Хаврын хөгжмийн наадам')).toBe('khavryn-khogjmiin-naadam');
    expect(slugify('Төгсөлтийн баяр — 12-р сургууль')).toBe('togsoltiin-bayar-12-r-surguuli');
    expect(slugify('Ерөнхий боловсролын сургууль')).toBe('yeronkhii-bolovsrolyn-surguuli');
  });

  it('handles Latin, punctuation and accents', () => {
    expect(slugify('  UB Marathon!!  2026 ')).toBe('ub-marathon-2026');
    expect(slugify('Café Été')).toBe('cafe-ete');
  });

  it('falls back when nothing usable remains and caps length', () => {
    expect(slugify('!!!')).toBe('event');
    const long = slugify('маш '.repeat(40));
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('createEventSchema', () => {
  const valid = {
    title: 'Туул гүйлт',
    startsAt: '2026-06-14T07:00:00+08:00',
    endsAt: '2026-06-14T15:00:00+08:00',
    pricePerPhoto: 15_000,
  };

  it('applies safe defaults (hidden until the photographer publishes)', () => {
    const parsed = createEventSchema.parse(valid);
    expect(parsed).toMatchObject({ category: 'OTHER', visibility: 'HIDDEN', timezone: 'Asia/Ulaanbaatar', faceSearchEnabled: true });
    expect(parsed.startsAt.toISOString()).toBe('2026-06-13T23:00:00.000Z');
  });

  it('rejects end before start, fractional prices, bad regex and bad timezone', () => {
    expect(createEventSchema.safeParse({ ...valid, endsAt: '2026-06-14T06:00:00+08:00' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, pricePerPhoto: 99.5 }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, bibPattern: '([0-9' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, category: 'PARTY' }).success).toBe(false);
  });

  it('requires an explicit UTC offset so event times are never ambiguous', () => {
    expect(createEventSchema.safeParse({ ...valid, startsAt: '2026-06-14T07:00:00' }).success).toBe(false);
  });
});

describe('updateEventSchema', () => {
  it('accepts partial updates but not empty ones', () => {
    expect(updateEventSchema.safeParse({ title: 'Шинэ нэр' }).success).toBe(true);
    expect(updateEventSchema.safeParse({}).success).toBe(false);
  });
});
