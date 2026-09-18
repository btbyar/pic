import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@pic/db';
import { ADMIN_PRISMA } from '../prisma/prisma.module';

/** Retention дуусахаас өмнө админд сануулах хугацаа (docs/ARCHITECTURE.md §6) */
export const EXPIRY_WARNING_DAYS = 7;

/** Админы нүүр: юуг шийдэх шаардлагатайг нэг харцаар. Бүх тоо `pic_admin_role`-оор (биометргүй). */
@Injectable()
export class AdminOverviewService {
  constructor(@Inject(ADMIN_PRISMA) private readonly prisma: PrismaClient) {}

  async overview() {
    const now = new Date();
    const warnUntil = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 3600_000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [pendingPhotographers, newRemovals, failedPhotos, expiring, monthOrders, monthRevenue] = await Promise.all([
      this.prisma.user.count({ where: { role: 'PHOTOGRAPHER', status: 'PENDING', deletedAt: null } }),
      this.prisma.removalRequest.count({ where: { status: { in: ['NEW', 'IN_REVIEW'] } } }),
      this.prisma.photo.count({ where: { processingStatus: 'FAILED', deletedAt: null } }),
      this.prisma.event.findMany({
        where: { deletedAt: null, expiresAt: { gt: now, lt: warnUntil } },
        select: { id: true, slug: true, title: true, expiresAt: true, _count: { select: { photos: true } } },
        orderBy: { expiresAt: 'asc' },
        take: 20,
      }),
      this.prisma.order.count({ where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: monthStart } } }),
      this.prisma.order.aggregate({
        where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      pendingPhotographers,
      newRemovals,
      failedPhotos,
      month: { orders: monthOrders, revenue: monthRevenue._sum.totalAmount ?? 0, since: monthStart },
      expiringEvents: expiring.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        expiresAt: e.expiresAt,
        photoCount: e._count.photos,
      })),
    };
  }
}
