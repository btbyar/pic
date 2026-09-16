import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient, UserStatus } from '@pic/db';
import { USER_STATUSES } from '@pic/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, CurrentUser, Roles } from '../auth/decorators';
import { hashIp } from '../common/crypto';
import { clientIp } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import type { Env } from '../config/env';
import { PRISMA } from '../prisma/prisma.module';

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const listQuerySchema = z.object({ status: z.enum(USER_STATUSES).optional() });

/** Төлөвийн шилжилт: хаанаас → хаашаа боломжтой */
const TRANSITIONS: Record<'approve' | 'reject' | 'suspend' | 'reinstate', { from: UserStatus[]; to: UserStatus }> = {
  approve: { from: ['PENDING', 'REJECTED'], to: 'APPROVED' },
  reject: { from: ['PENDING'], to: 'REJECTED' },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED' },
  reinstate: { from: ['SUSPENDED'], to: 'APPROVED' },
};

// TODO(Phase 6): ADMIN_DATABASE_URL (pic_admin_role) client руу шилжүүлнэ
@Roles('ADMIN')
@Controller('admin/photographers')
export class AdminPhotographersController {
  private readonly ipSecret: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
  }

  @Get()
  async list(@Query(new ZodPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    const users = await this.prisma.user.findMany({
      where: { role: 'PHOTOGRAPHER', deletedAt: null, ...(query.status ? { status: query.status } : {}) },
      include: { photographerProfile: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      revenueSharePct: u.photographerProfile?.revenueSharePct ?? null,
      rejectionReason: u.photographerProfile?.rejectionReason ?? null,
      suspendReason: u.photographerProfile?.suspendReason ?? null,
    }));
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthContext, @Req() req: Request) {
    return this.transition('approve', id, admin, req);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: { reason: string },
    @CurrentUser() admin: AuthContext,
    @Req() req: Request,
  ) {
    return this.transition('reject', id, admin, req, body.reason);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: { reason: string },
    @CurrentUser() admin: AuthContext,
    @Req() req: Request,
  ) {
    return this.transition('suspend', id, admin, req, body.reason);
  }

  @Post(':id/reinstate')
  @HttpCode(200)
  reinstate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthContext, @Req() req: Request) {
    return this.transition('reinstate', id, admin, req);
  }

  private async transition(
    kind: keyof typeof TRANSITIONS,
    userId: string,
    admin: AuthContext,
    req: Request,
    reason?: string,
  ) {
    const rule = TRANSITIONS[kind];
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, role: 'PHOTOGRAPHER', deletedAt: null } });
      if (!user) throw new NotFoundException({ statusCode: 404, code: 'photographer_not_found' });
      if (!rule.from.includes(user.status)) {
        throw new ConflictException({ statusCode: 409, code: 'invalid_status_transition', from: user.status, to: rule.to });
      }

      const now = new Date();
      await tx.user.update({ where: { id: userId }, data: { status: rule.to } });
      await tx.photographerProfile.update({
        where: { userId },
        data:
          kind === 'approve'
            ? { approvedById: admin.userId, approvedAt: now, rejectionReason: null }
            : kind === 'reject'
              ? { rejectionReason: reason ?? null }
              : kind === 'suspend'
                ? { suspendedAt: now, suspendReason: reason ?? null }
                : { suspendedAt: null, suspendReason: null },
      });
      if (kind === 'suspend' || kind === 'reject') {
        // Нэвтэрсэн төхөөрөмжүүдээс шууд гаргана
        await tx.authSession.deleteMany({ where: { userId } });
      }
      await this.audit.log(
        {
          actorId: admin.userId,
          actorRole: admin.role,
          action: `photographer.${kind}`,
          entityType: 'user',
          entityId: userId,
          before: { status: user.status },
          after: { status: rule.to },
          ...(reason ? { reason } : {}),
          ipHash: hashIp(clientIp(req), this.ipSecret),
        },
        tx,
      );
      return { id: userId, status: rule.to };
    });
  }
}
