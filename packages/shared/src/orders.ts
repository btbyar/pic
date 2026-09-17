import { z } from 'zod';
import type { OrderStatus } from './enums.js';
import { type RevenueSplit, splitRevenue } from './money.js';

// ---------------------------------------------------------------- үнэ

/** Нэг захиалгад орох зургийн дээд тоо (нэг хүн нэг эвэнтэд ~100 зурагтай байх нь ховор) */
export const ORDER_MAX_ITEMS = 500;

/**
 * Багц хэрэглэгдэхгүй шалтгаан (сагсанд харуулна).
 * - `no_bundle`: эвэнтэд багц үнэ тавиагүй
 * - `no_search`: сагсыг селфи хайлтаас үүсгээгүй
 * - `search_expired`: хайлтын хугацаа (≤24 цаг) дууссан эсвэл устгасан
 * - `not_matched`: сагсан дахь зарим зураг хайлтын үр дүнд байхгүй
 * - `not_cheaper`: зураг тус бүрээр нь авах нь хямд
 */
export const BUNDLE_BLOCKERS = ['no_bundle', 'no_search', 'search_expired', 'not_matched', 'not_cheaper'] as const;
export type BundleBlocker = (typeof BUNDLE_BLOCKERS)[number];

export interface OrderPriceInput {
  itemCount: number;
  pricePerPhoto: number;
  bundlePrice: number | null;
  /**
   * Бүх зураг нь энэ хүний селфи хайлтын үр дүнд байгаа эсэх. Багц нь "энэ эвэнтээс олдсон миний бүх зураг" —
   * хайлтгүйгээр зөвшөөрвөл хэн ч бүх эвэнтийг багц үнээр авна (decision #4).
   * `true` эсвэл яагаад биш гэдэг шалтгаан.
   */
  searchMatch: true | Exclude<BundleBlocker, 'no_bundle' | 'not_cheaper'>;
}

export interface OrderPrice {
  /** Зураг тус бүрээр авбал */
  subtotal: number;
  total: number;
  bundleApplied: boolean;
  bundleBlocker: BundleBlocker | null;
}

/** Серверт ба сагсанд ижил дүрэм: багц нь зөвшөөрөгдсөн бөгөөд хямд үед л хэрэглэгдэнэ. */
export function priceOrder(input: OrderPriceInput): OrderPrice {
  const { itemCount, pricePerPhoto, bundlePrice } = input;
  if (!Number.isSafeInteger(itemCount) || itemCount < 1 || itemCount > ORDER_MAX_ITEMS) {
    throw new RangeError(`itemCount must be an integer 1..${ORDER_MAX_ITEMS}, got ${itemCount}`);
  }
  for (const [name, value] of [['pricePerPhoto', pricePerPhoto], ['bundlePrice', bundlePrice ?? 0]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  }

  const subtotal = itemCount * pricePerPhoto;
  let bundleBlocker: BundleBlocker | null = null;
  if (bundlePrice === null) bundleBlocker = 'no_bundle';
  else if (input.searchMatch !== true) bundleBlocker = input.searchMatch;
  else if (bundlePrice >= subtotal) bundleBlocker = 'not_cheaper';

  const bundleApplied = bundleBlocker === null;
  return { subtotal, total: bundleApplied ? bundlePrice! : subtotal, bundleApplied, bundleBlocker };
}

export interface OrderItemAmounts extends RevenueSplit {
  price: number;
  photographerSharePct: number;
}

/**
 * Захиалгын нийт дүнг зураг бүрт хуваарилж, зурагчин/платформын хэсгийг тооцно.
 * Зураг бүрийн жагсаалтын үнэ ижил тул тэнцүү хуваана; бутархай үлдэгдлийг эхний зургуудад 1₮-өөр нэмнэ.
 * Нийлбэр нь үргэлж `total`-тай яг тэнцүү (payout, буцаалтын тооцоо үүн дээр тулгуурлана).
 */
export function allocateOrder(total: number, sharePcts: readonly number[]): OrderItemAmounts[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError(`total must be a non-negative integer, got ${total}`);
  const n = sharePcts.length;
  if (n === 0) throw new RangeError('order must have at least one item');
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return sharePcts.map((pct, i) => {
    const price = base + (i < remainder ? 1 : 0);
    return { price, photographerSharePct: pct, ...splitRevenue(price, pct) };
  });
}

// ---------------------------------------------------------------- төлөв

/** Татаж болох захиалга (хэсэгчлэн буцаасан бол буцаагаагүй зургууд) */
export const DOWNLOADABLE_ORDER_STATUSES: readonly OrderStatus[] = ['PAID', 'PARTIALLY_REFUNDED'];

// ---------------------------------------------------------------- schema

const photoIds = z
  .array(z.uuid())
  .min(1)
  .max(ORDER_MAX_ITEMS)
  .refine((ids) => new Set(ids).size === ids.length, 'duplicate photo ids');

export const orderQuoteSchema = z.object({
  photoIds,
  /** Селфи хайлтын session — зөвхөн багц үнэ шалгахад ашиглаад, захиалгад ХАДГАЛАХГҮЙ */
  searchSessionId: z.uuid().optional(),
  /** Нууц (UNLISTED) эвэнтийн холбоосны токен */
  t: z.string().max(100).optional(),
});
export type OrderQuoteInput = z.output<typeof orderQuoteSchema>;

export const createOrderSchema = orderQuoteSchema.extend({
  /** Татах холбоосыг имэйлээр авах — заавал биш */
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase())
    .optional(),
});
export type CreateOrderInput = z.output<typeof createOrderSchema>;

/** Захиалгын нууц токен (x-order-token header) */
export const orderTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);
