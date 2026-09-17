import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OrderStatus, PrismaClient } from '@pic/db';
import { EMAIL_QUEUE, type EmailQueue } from '../queue/queue.module';
import { PRISMA } from '../prisma/prisma.module';
import { PaymentProvider, PaymentUnavailableError } from './payment-provider';

const EXPIRE_BATCH = 200;

/**
 * Төлбөрийн төлөвийг провайдертэй тулгана. API (callback, polling) ба worker (хугацаа дуусгах) хоёулаа ашиглана.
 *
 * - Callback-т итгэхгүй: үргэлж провайдерын `checkInvoice`-ээр шалгана.
 * - Idempotent: PAID болгох UPDATE нь нөхцөлтэй тул зэрэг ирсэн callback + polling нэг л удаа тоологдоно.
 * - Хугацаа дууссаны дараа төлөгдсөн бол (хэрэглэгч аль хэдийн мөнгө шилжүүлсэн) PAID болгоно.
 */
@Injectable()
export class OrderPaymentsService {
  private readonly logger = new Logger(OrderPaymentsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly provider: PaymentProvider,
    @Inject(EMAIL_QUEUE) private readonly emailQueue: EmailQueue,
  ) {}

  /** Захиалгын нэхэмжлэхүүдийг провайдераас шалгаад, төлөгдсөн бол PAID болгоно. Шинэ төлвийг буцаана. */
  async reconcile(orderId: string): Promise<OrderStatus | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        payments: { where: { status: { in: ['PENDING', 'EXPIRED'] } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) return null;
    if (order.status !== 'PENDING' && order.status !== 'EXPIRED') return order.status;

    for (const payment of order.payments) {
      if (payment.provider !== this.provider.name) continue;
      const check = await this.provider.checkInvoice(payment.providerInvoiceId);
      if (!check.paid) continue;
      if (check.paidAmount < payment.amount) {
        this.logger.warn(`payment ${payment.id}: paid ${check.paidAmount} < expected ${payment.amount}`);
        continue;
      }
      await this.markPaid(orderId, payment.id, check.providerPaymentId, check.raw);
      return 'PAID';
    }
    return order.status;
  }

  /** Төлбөртэй (эсвэл үнэгүй) захиалгыг PAID болгож, статистик ба имэйлийг нэг удаа үүсгэнэ. */
  async markPaid(orderId: string, paymentId: string | null, providerPaymentId: string | null, raw: unknown): Promise<boolean> {
    const becamePaid = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['PENDING', 'EXPIRED'] } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (count === 0) return false;
      if (paymentId) {
        const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { rawPayload: true } });
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'PAID',
            providerPaymentId,
            rawPayload: { ...(payment.rawPayload as Record<string, unknown>), check: raw as object },
          },
        });
      }
      // Өдрийн статистик (Монголын цагаар) — нүүр хуудас, зурагчны самбарт
      await tx.$executeRaw`
        INSERT INTO "public"."event_daily_stat" (event_id, date, orders, revenue)
        SELECT o.event_id, (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date, 1, o.total_amount
        FROM "public"."order" o WHERE o.id = ${orderId}::uuid AND o.event_id IS NOT NULL
        ON CONFLICT (event_id, date) DO UPDATE
        SET orders = "event_daily_stat".orders + 1, revenue = "event_daily_stat".revenue + EXCLUDED.revenue`;
      return true;
    });

    if (becamePaid) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { accessTokenEnc: true } });
      if (order?.accessTokenEnc) {
        await this.emailQueue.add('order_paid', { kind: 'order_paid', orderId }, { jobId: `order-paid-${orderId}` });
      }
      this.logger.log(`order ${orderId} paid`);
    }
    return becamePaid;
  }

  /** Төлөх хугацаа нь дууссан захиалгуудыг сүүлчийн удаа шалгаад EXPIRED болгоно (worker, 5 минут тутам). */
  async expireDue(now = new Date()): Promise<{ paid: number; expired: number }> {
    const due = await this.prisma.order.findMany({
      where: { status: 'PENDING', paymentDueAt: { lt: now } },
      select: { id: true },
      orderBy: { paymentDueAt: 'asc' },
      take: EXPIRE_BATCH,
    });
    let paid = 0;
    let expired = 0;
    for (const { id } of due) {
      try {
        if ((await this.reconcile(id)) === 'PAID') {
          paid++;
          continue;
        }
      } catch (err) {
        // Провайдер унасан бол дараагийн удаа дахин шалгана — төлсөн байж болзошгүй захиалгыг EXPIRED болгохгүй
        if (err instanceof PaymentUnavailableError) {
          this.logger.warn(`expire check skipped for ${id}: ${err.message}`);
          continue;
        }
        throw err;
      }

      const { changed, payments } = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        if (count === 0) return { changed: false, payments: [] };
        const pending = await tx.payment.findMany({ where: { orderId: id, status: 'PENDING' } });
        await tx.payment.updateMany({ where: { orderId: id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        return { changed: true, payments: pending };
      });
      if (changed) expired++;
      for (const payment of payments) {
        if (payment.provider !== this.provider.name) continue;
        await this.provider.cancelInvoice(payment.providerInvoiceId).catch((err: unknown) => {
          this.logger.warn(`cancel invoice ${payment.id} failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    }
    // PAID болсон ч имэйл queue-д орж амжаагүй (процесс унасан г.м.) захиалгууд. Ижил jobId-тэй job
    // (хүлээгдэж буй эсвэл 7 хоног хадгалагдах амжилтгүй) байвал BullMQ давхар нэмэхгүй.
    const unsent = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        accessTokenEnc: { not: null },
        paidAt: { lt: new Date(now.getTime() - 10 * 60_000), gt: new Date(now.getTime() - 7 * 24 * 3600_000) },
      },
      select: { id: true },
      take: EXPIRE_BATCH,
    });
    for (const { id } of unsent) {
      await this.emailQueue.add('order_paid', { kind: 'order_paid', orderId: id }, { jobId: `order-paid-${id}` });
    }

    if (paid || expired) this.logger.log(`orders: ${paid} paid late, ${expired} expired`);
    return { paid, expired };
  }
}
