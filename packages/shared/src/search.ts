import { z } from 'zod';

// ---------------------------------------------------------------- зөвшөөрөл

/**
 * Зөвшөөрлийн текстийн хувилбар. Текст (apps/web/messages/mn.json → search.consent) өөрчлөгдөх бүрт шинэчилнэ;
 * хайлтын session бүр аль хувилбарыг зөвшөөрснийг хадгална. ⚠️ Хуульчаар хянуулаагүй.
 */
export const CONSENT_VERSION = '2026-09-17';

// ---------------------------------------------------------------- ангилал

export interface MatchThresholds {
  /** "Таны зургууд" */
  high: number;
  /** "Магадгүй таных" */
  low: number;
}

export interface ClassifiedMatches {
  mine: string[];
  maybe: string[];
}

/**
 * Хайлтын үр дүнг хоёр хэсэгт хуваана.
 *
 * - `direct`: селфитэй шууд харьцуулсан зураг тус бүрийн хамгийн өндөр төсөө
 * - `expansion`: "Таны зургууд"-аас олдсон нүүрүүдээр дахин хайхад гарсан төсөө. Селфигээс өөр өнцөг,
 *   гэрэлтүүлэгтэй зургийг олоход тусална. Гэхдээ андуурсан нүүрээс гинжин алдаа үүсэж болзошгүй тул
 *   зөвхөн "Магадгүй"-д нэмнэ, "Таны зургууд"-д хэзээ ч шууд оруулахгүй.
 */
export function classifyMatches(
  direct: ReadonlyMap<string, number>,
  expansion: ReadonlyMap<string, number>,
  t: MatchThresholds,
): ClassifiedMatches {
  if (!(t.low <= t.high)) throw new RangeError('low threshold must not exceed high threshold');
  const mine = [...direct].filter(([, s]) => s >= t.high).map(([id]) => id);
  const mineSet = new Set(mine);
  const maybeScores = new Map<string, number>();
  for (const [id, s] of direct) {
    if (!mineSet.has(id) && s >= t.low) maybeScores.set(id, s);
  }
  for (const [id, s] of expansion) {
    if (!mineSet.has(id) && s >= t.high) maybeScores.set(id, Math.max(maybeScores.get(id) ?? 0, direct.get(id) ?? 0));
  }
  // Магадгүй: итгэл өндрөөс нь эхэлнэ
  const maybe = [...maybeScores].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  return { mine, maybe };
}

/** Өргөтгөлд ашиглах нүүр: хамгийн итгэлтэй `topK` таарал */
export function pickExpansionSeeds<T extends { score: number }>(mineMatches: T[], topK: number): T[] {
  return [...mineMatches].sort((a, b) => b.score - a.score).slice(0, Math.max(0, topK));
}

// ---------------------------------------------------------------- schema

/** Хадгалсан хайлтын үр дүн авах query: нууц (UNLISTED) эвэнтийн холбоосны токен */
export const searchResultsQuerySchema = z.object({
  t: z.string().max(100).optional(),
});

export const REMOVAL_REASONS = ['ME_IN_PHOTO', 'INAPPROPRIATE', 'COPYRIGHT', 'OTHER'] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];

export const removalRequestSchema = z.object({
  reason: z.enum(REMOVAL_REASONS),
  message: z.string().trim().max(1000).optional(),
  /** Хариу авах имэйл/утас — заавал биш */
  contact: z.string().trim().max(200).optional(),
});

export type RemovalRequestInput = z.output<typeof removalRequestSchema>;
