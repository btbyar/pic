import { Body, Controller, Get, Inject, Module, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@pic/db';
import { buildLedger, maskAccount, type PayoutAccountInput, payoutAccountSchema, payoutPeriod } from '@pic/shared';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentUser, Roles } from '../auth/decorators';
import { FieldCipher } from '../common/crypto';
import { ZodPipe } from '../common/zod.pipe';
import type { Env } from '../config/env';
import { PRISMA } from '../prisma/prisma.module';
import { loadActivity } from './ledger';

/** Зурагчин өөрийн орлого, төлбөр, банкны дансаа харна */
@Roles('PHOTOGRAPHER')
@Controller('photographer')
export class PhotographerFinanceController {
  private readonly cipher: FieldCipher;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.cipher = new FieldCipher(config.get('FIELD_ENCRYPTION_KEY', { infer: true }));
  }

  @Get('earnings')
  async earnings(@CurrentUser() user: AuthContext) {
    const [activity, payouts, profile] = await Promise.all([
      loadActivity(this.prisma, user.userId),
      this.prisma.payout.findMany({ where: { photographerId: user.userId } }),
      this.prisma.photographerProfile.findUnique({ where: { userId: user.userId } }),
    ]);
    const paid = new Map(payouts.map((p) => [p.period, p]));
    const rows = buildLedger(activity.get(user.userId) ?? []).reverse();
    return {
      revenueSharePct: profile?.revenueSharePct ?? null,
      currentPeriod: payoutPeriod(new Date()),
      account: this.maskedAccount(profile?.bankAccountEnc ?? null, profile?.bankName ?? null),
      months: rows.map((r) => {
        const p = paid.get(r.period);
        return { ...r, payout: p ? { status: p.status, netAmount: p.netAmount, paidAt: p.paidAt, reference: p.reference } : null };
      }),
    };
  }

  @Put('payout-account')
  async setAccount(@CurrentUser() user: AuthContext, @Body(new ZodPipe(payoutAccountSchema)) body: PayoutAccountInput) {
    const enc = this.cipher.encrypt(JSON.stringify({ accountNumber: body.accountNumber, accountName: body.accountName }));
    await this.prisma.photographerProfile.update({
      where: { userId: user.userId },
      data: { bankName: body.bankName, bankAccountEnc: enc },
    });
    // Данс солих нь мөнгө хаашаа очихыг өөрчилдөг тул бүртгэнэ (дугаарыг биш)
    await this.audit.log({
      actorId: user.userId,
      actorRole: user.role,
      action: 'photographer.payout_account',
      entityType: 'user',
      entityId: user.userId,
      after: { bankName: body.bankName, account: maskAccount(body.accountNumber) },
    });
    return { account: { bankName: body.bankName, accountNumber: maskAccount(body.accountNumber), accountName: body.accountName } };
  }

  private maskedAccount(enc: string | null, bankName: string | null) {
    if (!enc || !bankName) return null;
    const { accountNumber, accountName } = JSON.parse(this.cipher.decrypt(enc)) as { accountNumber: string; accountName: string };
    return { bankName, accountNumber: maskAccount(accountNumber), accountName };
  }
}

@Module({ controllers: [PhotographerFinanceController] })
export class FinanceModule {}
