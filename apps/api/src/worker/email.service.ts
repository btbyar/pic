import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@pic/db';
import type { EmailJob } from '@pic/shared';
import { PASSWORD_RESET_TTL_MIN } from '../auth/auth.service';
import { FieldCipher } from '../common/crypto';
import type { Env } from '../config/env';
import { Mailer } from '../mail/mailer';
import { orderPaidEmail, passwordResetEmail } from '../mail/templates';
import { PRISMA } from '../prisma/prisma.module';

const mnt = (amount: number) => `${new Intl.NumberFormat('en-US').format(amount).replace(/,/g, ' ')}₮`;

function ubDate(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}.${p.month}.${p.day}`;
}

export type EmailOutcome = 'sent' | 'skipped';

/**
 * Имэйлийн job-ыг илгээнэ. Хүлээн авагч, холбоосыг DB-ээс уншдаг тул хуучирсан job (ашигласан токен,
 * аль хэдийн илгээсэн захиалга) юу ч илгээхгүй — давтан оролдлого аюулгүй.
 */
@Injectable()
export class EmailService {
  private readonly cipher: FieldCipher;
  private readonly webOrigin: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly mailer: Mailer,
    config: ConfigService<Env, true>,
  ) {
    this.cipher = new FieldCipher(config.get('FIELD_ENCRYPTION_KEY', { infer: true }));
    this.webOrigin = config.get('WEB_ORIGIN', { infer: true }).replace(/\/+$/, '');
  }

  async process(job: EmailJob): Promise<EmailOutcome> {
    switch (job.kind) {
      case 'password_reset':
        return this.passwordReset(job.resetId, job.tokenEnc);
      case 'order_paid':
        return this.orderPaid(job.orderId);
    }
  }

  private async passwordReset(resetId: string, tokenEnc: string): Promise<EmailOutcome> {
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { id: resetId },
      include: { user: { select: { email: true } } },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return 'skipped';
    // Токен #fragment-д: сервер/proxy-ийн log, Referer-т орохгүй
    const url = `${this.webOrigin}/reset-password#token=${this.cipher.decrypt(tokenEnc)}`;
    await this.mailer.send(passwordResetEmail(reset.user.email, url, PASSWORD_RESET_TTL_MIN));
    return 'sent';
  }

  private async orderPaid(orderId: string): Promise<EmailOutcome> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { _count: { select: { items: true } }, event: { select: { expiresAt: true } } },
    });
    if (!order || order.status !== 'PAID' || !order.accessTokenEnc || !order.contactEmail) return 'skipped';

    const url = `${this.webOrigin}/orders/${order.id}#t=${this.cipher.decrypt(order.accessTokenEnc)}`;
    await this.mailer.send(
      orderPaidEmail(order.contactEmail, {
        url,
        eventTitle: order.eventTitleSnap,
        itemCount: order._count.items,
        totalLabel: mnt(order.totalAmount),
        downloadableUntil: order.event ? ubDate(order.event.expiresAt) : '—',
      }),
    );
    // Илгээсний дараа шифрлэсэн токеныг устгана (DB-д нууц холбоос үлдэхгүй)
    await this.prisma.order.update({ where: { id: order.id }, data: { accessTokenEnc: null, emailSentAt: new Date() } });
    return 'sent';
  }
}
