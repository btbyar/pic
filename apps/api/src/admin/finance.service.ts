import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrderStatus, Prisma, PrismaClient } from '@pic/db';
import {
  buildLedger,
  type CreateRefundInput,
  isClosedPeriod,
  type MarkPayoutPaidInput,
  payoutPeriod,
  refundAmount,
} from '@pic/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/decorators';
import { FieldCipher, hashIp } from '../common/crypto';
import type { Env } from '../config/env';
import { loadActivity } from '../finance/ledger';
import { ADMIN_PRISMA } from '../prisma/prisma.module';

const PAGE_SIZE = 50;

export interface PayoutAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/**
 * Захиалга, буцаалт, зурагчны сарын төлбөр (админ). `pic_admin_role`-оор.
 *
 * Буцаалт: мөнгийг одоогоор админ банкаар гараар буцаана (QPay-ийн буцаалтын API нь зөвхөн картын
 * төлбөрт) — энд бүртгэж, зурагчны дараагийн төлбөрөөс хасагдана.
 */
@Injectable()
export class FinanceService {
  private readonly cipher: FieldCipher;
  private readonly ipSecret: string;

  constructor(
    @Inject(ADMIN_PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.cipher = new FieldCipher(config.get('FIELD_ENCRYPTION_KEY', { infer: true }));
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
  }

  // ================================================================ захиалга

  async listOrders(query: { status?: OrderStatus | undefined; q?: string | undefined; cursor?: string | undefined }) {
    const q = query.q?.trim().toLowerCase();
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? /^[0-9a-f-]{36}$/.test(q)
          ? { id: q }
          : { OR: [{ contactEmail: { contains: q } }, { eventTitleSnap: { contains: q, mode: 'insensitive' } }] }
        : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        status: true,
        eventTitleSnap: true,
        totalAmount: true,
        contactEmail: true,
        createdAt: true,
        paidAt: true,
        _count: { select: { items: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map(({ _count, ...o }) => ({ ...o, itemCount: _count.items })),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null,
    };
  }

  async getOrder(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: { photographer: { select: { displayName: true } } },
        },
        payments: { orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'asc' }, include: { createdBy: { select: { displayName: true } } } },
      },
    });
    if (!order) throw new NotFoundException({ statusCode: 404, code: 'order_not_found' });
    return {
      id: order.id,
      status: order.status,
      eventTitle: order.eventTitleSnap,
      totalAmount: order.totalAmount,
      contactEmail: order.contactEmail,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      items: order.items.map((i) => ({
        id: i.id,
        photoId: i.photoId,
        filename: i.photoFilenameSnap,
        photographer: i.photographer.displayName,
        pricing: i.pricing,
        price: i.price,
        photographerAmount: i.photographerAmount,
        platformAmount: i.platformAmount,
        refunded: i.refundId !== null,
      })),
      payments: order.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amount: p.amount,
        providerInvoiceId: p.providerInvoiceId,
        providerPaymentId: p.providerPaymentId,
        createdAt: p.createdAt,
      })),
      refunds: order.refunds.map((r) => ({
        id: r.id,
        amount: r.amount,
        reason: r.reason,
        providerRef: r.providerRef,
        createdBy: r.createdBy.displayName,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Сонгосон зургуудын үнийг буцаана. Бүгдийг буцаасан бол REFUNDED, үгүй бол PARTIALLY_REFUNDED. */
  async refund(admin: AuthContext, orderId: string, input: CreateRefundInput, ip: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Зэрэг хоёр буцаалт нэг зургийг давхар буцаахаас сэргийлж захиалгын мөрийг түгжинэ
      await tx.$executeRaw`SELECT 1 FROM "public"."order" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new NotFoundException({ statusCode: 404, code: 'order_not_found' });
      if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED') {
        throw new ConflictException({ statusCode: 409, code: 'order_not_refundable' });
      }
      const selected = order.items.filter((i) => input.itemIds.includes(i.id));
      if (selected.length !== input.itemIds.length || selected.some((i) => i.refundId)) {
        throw new ConflictException({ statusCode: 409, code: 'items_not_refundable' });
      }
      const amount = refundAmount(selected);
      if (amount <= 0) throw new ConflictException({ statusCode: 409, code: 'nothing_to_refund' });

      const refund = await tx.refund.create({
        data: {
          orderId,
          amount,
          reason: input.reason,
          providerRef: input.providerRef ?? null,
          createdById: admin.userId,
          items: { connect: selected.map((i) => ({ id: i.id })) },
        },
      });
      const remaining = order.items.filter((i) => !i.refundId && !input.itemIds.includes(i.id)).length;
      const status: OrderStatus = remaining === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await tx.order.update({ where: { id: orderId }, data: { status } });
      await this.audit.log(
        {
          actorId: admin.userId,
          actorRole: admin.role,
          action: 'refund.create',
          entityType: 'order',
          entityId: orderId,
          before: { status: order.status },
          after: { status, refundId: refund.id, amount, itemIds: input.itemIds },
          reason: input.reason,
          ipHash: hashIp(ip, this.ipSecret),
        },
        tx,
      );
      return { refundId: refund.id, amount, status };
    });
    return result;
  }

  // ================================================================ зурагчны төлбөр

  /** Тухайн сард төлөх дүн (зурагчин бүрээр) + банкны данс + төлсөн эсэх */
  async payouts(period: string, now = new Date()) {
    const [activity, paid, profiles] = await Promise.all([
      loadActivity(this.prisma),
      this.prisma.payout.findMany({ where: { period } }),
      this.prisma.photographerProfile.findMany({
        select: { userId: true, bankName: true, bankAccountEnc: true, user: { select: { displayName: true, email: true } } },
      }),
    ]);
    const paidBy = new Map(paid.map((p) => [p.photographerId, p]));
    const profileBy = new Map(profiles.map((p) => [p.userId, p]));

    const rows = [...activity.entries()].flatMap(([photographerId, acts]) => {
      const row = buildLedger(acts).find((r) => r.period === period);
      const payout = paidBy.get(photographerId);
      if (!row && !payout) return [];
      const profile = profileBy.get(photographerId);
      return [
        {
          photographerId,
          displayName: profile?.user.displayName ?? '—',
          email: profile?.user.email ?? null,
          account: profile ? this.account(profile.bankAccountEnc, profile.bankName) : null,
          gross: row?.gross ?? 0,
          refunded: row?.refunded ?? 0,
          carriedIn: row?.carriedIn ?? 0,
          net: row?.net ?? 0,
          payable: row?.payable ?? 0,
          payout: payout
            ? { status: payout.status, netAmount: payout.netAmount, paidAt: payout.paidAt, reference: payout.reference }
            : null,
        },
      ];
    });
    rows.sort((a, b) => b.payable - a.payable);
    return { period, closed: isClosedPeriod(period, now), currentPeriod: payoutPeriod(now), rows };
  }

  async markPaid(admin: AuthContext, input: MarkPayoutPaidInput, ip: string, now = new Date()) {
    if (!isClosedPeriod(input.period, now)) {
      // Сар дуусаагүй бол буцаалт нэмэгдэж дүн өөрчлөгдөж болно
      throw new ConflictException({ statusCode: 409, code: 'period_not_closed' });
    }
    const activity = (await loadActivity(this.prisma, input.photographerId)).get(input.photographerId) ?? [];
    const row = buildLedger(activity).find((r) => r.period === input.period);
    if (!row || row.payable <= 0) throw new ConflictException({ statusCode: 409, code: 'nothing_to_pay' });

    const existing = await this.prisma.payout.findUnique({
      where: { photographerId_period: { photographerId: input.photographerId, period: input.period } },
    });
    if (existing?.status === 'PAID') throw new ConflictException({ statusCode: 409, code: 'payout_already_paid' });

    const data = {
      grossAmount: row.gross,
      // Энэ сарын буцаалт + өмнөх сараас шилжсэн суутгал
      refundAdjust: row.refunded - row.carriedIn,
      netAmount: row.payable,
      status: 'PAID' as const,
      paidAt: now,
      paidById: admin.userId,
      reference: input.reference,
    };
    const payout = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.payout.upsert({
        where: { photographerId_period: { photographerId: input.photographerId, period: input.period } },
        create: { photographerId: input.photographerId, period: input.period, ...data },
        update: data,
      });
      await this.audit.log(
        {
          actorId: admin.userId,
          actorRole: admin.role,
          action: 'payout.paid',
          entityType: 'payout',
          entityId: saved.id,
          after: { photographerId: input.photographerId, period: input.period, netAmount: row.payable, reference: input.reference },
          ipHash: hashIp(ip, this.ipSecret),
        },
        tx,
      );
      return saved;
    });
    return { id: payout.id, status: payout.status, netAmount: payout.netAmount };
  }

  private account(enc: string | null, bankName: string | null): PayoutAccount | null {
    if (!enc || !bankName) return null;
    const { accountNumber, accountName } = JSON.parse(this.cipher.decrypt(enc)) as Omit<PayoutAccount, 'bankName'>;
    return { bankName, accountNumber, accountName };
  }
}
