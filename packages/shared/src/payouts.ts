import { z } from 'zod';

// Зурагчны орлогын тооцоо сараар (Улаанбаатарын цагаар). Бүх дүн бүхэл төгрөг.

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const periodSchema = z.string().regex(PERIOD_RE);

/** Огноо → "2026-09" (Asia/Ulaanbaatar, UTC+8, зуны цаггүй) */
export function payoutPeriod(date: Date): string {
  const ub = new Date(date.getTime() + 8 * 3600_000);
  return `${ub.getUTCFullYear()}-${String(ub.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Сар дууссан эсэх — зөвхөн хаагдсан сарыг төлнө (энэ сард буцаалт нэмэгдэж болзошгүй) */
export function isClosedPeriod(period: string, now: Date): boolean {
  return period < payoutPeriod(now);
}

export interface PeriodActivity {
  period: string;
  /** Тухайн сард төлөгдсөн захиалгуудын зурагчны хэсэг */
  gross: number;
  /** Тухайн сард хийсэн буцаалтын зурагчны хэсэг (зарагдсан сараас үл хамааран) */
  refunded: number;
}

export interface LedgerRow extends PeriodActivity {
  /** Өмнөх сараас шилжсэн суутгал (≤ 0) */
  carriedIn: number;
  /** gross − refunded + carriedIn; сөрөг байж болно */
  net: number;
  /** Шилжүүлэх дүн: max(0, net) */
  payable: number;
}

/**
 * Сар бүрийн тооцоо. Буцаалтыг буцаалт хийсэн сард хасдаг тул төлөгдсөн сарын дүн дараа нь өөрчлөгдөхгүй.
 * Буцаалт орлогоосоо их байвал (net < 0) дутагдлыг дараагийн сарын орлогоос суутгана.
 * Үйл ажиллагаагүй сар ч шилжүүлгийг дамжуулна.
 */
export function buildLedger(activity: readonly PeriodActivity[]): LedgerRow[] {
  const byPeriod = new Map<string, PeriodActivity>();
  for (const a of activity) {
    if (!PERIOD_RE.test(a.period)) throw new RangeError(`invalid period ${a.period}`);
    for (const v of [a.gross, a.refunded]) {
      if (!Number.isSafeInteger(v) || v < 0) throw new RangeError('amounts must be non-negative integers');
    }
    const prev = byPeriod.get(a.period);
    byPeriod.set(a.period, {
      period: a.period,
      gross: (prev?.gross ?? 0) + a.gross,
      refunded: (prev?.refunded ?? 0) + a.refunded,
    });
  }
  const periods = [...byPeriod.keys()].sort();
  if (periods.length === 0) return [];

  const rows: LedgerRow[] = [];
  let carry = 0;
  for (let p = periods[0]!; p <= periods[periods.length - 1]!; p = nextPeriod(p)) {
    const a = byPeriod.get(p) ?? { period: p, gross: 0, refunded: 0 };
    const net = a.gross - a.refunded + carry;
    if (byPeriod.has(p) || carry !== 0) rows.push({ ...a, carriedIn: carry, net, payable: Math.max(0, net) });
    carry = Math.min(0, net);
  }
  return rows;
}

// ---------------------------------------------------------------- буцаалт

/** Буцаах дүн = сонгосон зургуудын төлсөн үнийн нийлбэр (багцын үед хуваарилсан үнэ) */
export function refundAmount(items: readonly { price: number }[]): number {
  return items.reduce((sum, i) => sum + i.price, 0);
}

export const createRefundSchema = z.object({
  itemIds: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'duplicate item ids'),
  reason: z.string().trim().min(3).max(500),
  /** Банкны гүйлгээний дугаар (мөнгийг гараар буцаасан бол) */
  providerRef: z.string().trim().max(100).optional(),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
});
export type CreateRefundInput = z.output<typeof createRefundSchema>;

export const markPayoutPaidSchema = z.object({
  photographerId: z.uuid(),
  period: periodSchema,
  reference: z.string().trim().min(3).max(100),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
});
export type MarkPayoutPaidInput = z.output<typeof markPayoutPaidSchema>;

export const payoutAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(60),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{6,20}$/),
  accountName: z.string().trim().min(2).max(100),
});
export type PayoutAccountInput = z.output<typeof payoutAccountSchema>;

/** "5012345678" → "••••5678" */
export function maskAccount(accountNumber: string): string {
  return `••••${accountNumber.slice(-4)}`;
}
