import { z } from 'zod';
import { EVENT_CATEGORIES, EVENT_VISIBILITIES } from './enums.js';

// ---------------------------------------------------------------- slug

// MNS 5217 дээр суурилсан, URL-д ойлгомжтой галиглал
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'ye', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: 'i',
  э: 'e', ю: 'yu', я: 'ya',
};

const VOWELS = new Set([...'аэиоуөүяеёюы']);

export const SLUG_MAX_LENGTH = 60;

/** "Туул голын трейл гүйлт 2026" → "tuul-golyn-treil-guilt-2026" */
export function slugify(title: string): string {
  const chars = [...title.toLowerCase().normalize('NFC')];
  const latin = chars
    .map((ch, i) => {
      // "е": үгийн эхэнд, эгшгийн дараа "ye" (Ерөнхий → yeronkhii), гийгүүлэгчийн дараа "e" (трейл → treil)
      if (ch === 'е') return i > 0 && !VOWELS.has(chars[i - 1]!) && /\p{L}/u.test(chars[i - 1]!) ? 'e' : 'ye';
      return CYRILLIC_TO_LATIN[ch] ?? ch;
    })
    .join('');
  const slug = latin
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'event';
}

// ---------------------------------------------------------------- schema

export const MAX_PRICE_MNT = 10_000_000;

const isoDateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const timezone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'unknown timezone');

/**
 * Bib дугаарын regex. OCR-ын богино мөр (≤12 тэмдэгт) дээр ажиллах тул ReDoS эрсдэл бага,
 * гэхдээ уртыг хязгаарлаж, compile болж байгааг шалгана.
 */
const bibPattern = z
  .string()
  .max(50)
  .refine((p) => {
    try {
      new RegExp(p);
      return true;
    } catch {
      return false;
    }
  }, 'invalid regular expression');

const price = z.number().int().min(0).max(MAX_PRICE_MNT);

const eventFields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).nullable(),
  location: z.string().trim().max(200).nullable(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  timezone,
  category: z.enum(EVENT_CATEGORIES),
  visibility: z.enum(EVENT_VISIBILITIES),
  pricePerPhoto: price,
  bundlePrice: price.nullable(),
  bibPattern: bibPattern.nullable(),
  faceSearchEnabled: z.boolean(),
};

export const createEventSchema = z
  .object({
    ...eventFields,
    description: eventFields.description.optional(),
    location: eventFields.location.optional(),
    timezone: eventFields.timezone.default('Asia/Ulaanbaatar'),
    category: eventFields.category.default('OTHER'),
    visibility: eventFields.visibility.default('HIDDEN'),
    bundlePrice: eventFields.bundlePrice.optional(),
    bibPattern: eventFields.bibPattern.optional(),
    faceSearchEnabled: eventFields.faceSearchEnabled.default(true),
  })
  .refine((e) => e.endsAt >= e.startsAt, { path: ['endsAt'], message: 'endsAt must not be before startsAt' });
export type CreateEventInput = z.output<typeof createEventSchema>;

/** Хэсэгчилсэн засвар. Огнооны дарааллыг хадгалагдсан утгатай нийлүүлж service шалгана. */
export const updateEventSchema = z
  .object(eventFields)
  .partial()
  .refine((e) => Object.keys(e).length > 0, 'no fields to update');
export type UpdateEventInput = z.output<typeof updateEventSchema>;

export const addEventPhotographerSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
});

/** Камерын цаг ±24 цаг хүртэл зөрөхийг засна */
export const clockOffsetSchema = z.object({
  clockOffsetSec: z.number().int().min(-86_400).max(86_400),
});
