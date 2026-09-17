import { Body, Controller, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@pic/db';
import { type RemovalRequestInput, removalRequestSchema } from '@pic/shared';
import { type AuthedRequest, Public } from '../auth/decorators';
import { hashIp } from '../common/crypto';
import { RateLimiter } from '../common/rate-limiter';
import { clientIp } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import type { Env } from '../config/env';
import { PRISMA } from '../prisma/prisma.module';

const REMOVAL_BY_IP = { name: 'removal:ip', limit: 10, windowSec: 60 * 60 };

/**
 * Зураг бүр дээрх "Устгуулах хүсэлт" — нэвтрэлтгүй. Админ Phase 6-ийн самбараас шийдвэрлэнэ.
 * Хүсэлт гаргагчийн IP хадгалахгүй (rate limit нь зөвхөн Redis-д, hash-аар).
 */
@Public()
@Controller('photos')
export class RemovalRequestsController {
  private readonly ipSecret: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly rateLimiter: RateLimiter,
    config: ConfigService<Env, true>,
  ) {
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
  }

  @Post(':id/removal-requests')
  async create(
    @Param('id', ParseUUIDPipe) photoId: string,
    @Body(new ZodPipe(removalRequestSchema)) body: RemovalRequestInput,
    @Req() req: AuthedRequest,
  ) {
    await this.rateLimiter.consume(REMOVAL_BY_IP, hashIp(clientIp(req), this.ipSecret));
    const photo = await this.prisma.photo.findFirst({ where: { id: photoId, deletedAt: null }, select: { id: true } });
    if (!photo) throw new NotFoundException({ statusCode: 404, code: 'photo_not_found' });

    const request = await this.prisma.removalRequest.create({
      data: {
        photoId: photo.id,
        reason: body.message ? `${body.reason}: ${body.message}` : body.reason,
        contact: body.contact || null,
      },
      select: { id: true, status: true, createdAt: true },
    });
    return request;
  }
}
