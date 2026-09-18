import { Prisma, type PrismaClient } from '@pic/db';
import type { PeriodActivity } from '@pic/shared';

/**
 * Зурагчин тус бүрийн сарын орлого ба буцаалт (Улаанбаатарын цагаар).
 * - Орлого: захиалга төлөгдсөн сард (дараа нь буцаасан ч — буцаалт тусдаа мөрөөр хасагдана)
 * - Буцаалт: буцаалт хийсэн сард
 */
export async function loadActivity(prisma: PrismaClient, photographerId?: string): Promise<Map<string, PeriodActivity[]>> {
  const who = photographerId ? Prisma.sql`AND oi.photographer_id = ${photographerId}::uuid` : Prisma.empty;
  const [sales, refunds] = await Promise.all([
    prisma.$queryRaw<{ photographer_id: string; period: string; amount: number }[]>`
      SELECT oi.photographer_id, to_char(o.paid_at AT TIME ZONE 'Asia/Ulaanbaatar', 'YYYY-MM') AS period,
             sum(oi.photographer_amount)::int AS amount
      FROM "public"."order_item" oi JOIN "public"."order" o ON o.id = oi.order_id
      WHERE o.paid_at IS NOT NULL AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') ${who}
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ photographer_id: string; period: string; amount: number }[]>`
      SELECT oi.photographer_id, to_char(r.created_at AT TIME ZONE 'Asia/Ulaanbaatar', 'YYYY-MM') AS period,
             sum(oi.photographer_amount)::int AS amount
      FROM "public"."order_item" oi JOIN "public"."refund" r ON r.id = oi.refund_id
      WHERE true ${who}
      GROUP BY 1, 2`,
  ]);

  const result = new Map<string, PeriodActivity[]>();
  const push = (id: string, a: PeriodActivity) => result.set(id, [...(result.get(id) ?? []), a]);
  for (const s of sales) push(s.photographer_id, { period: s.period, gross: s.amount, refunded: 0 });
  for (const r of refunds) push(r.photographer_id, { period: r.period, gross: 0, refunded: r.amount });
  return result;
}
