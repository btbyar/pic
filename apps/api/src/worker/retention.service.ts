import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@pic/db';
import { SOFT_DELETE_RESTORE_DAYS } from '@pic/shared';
import { PhotoPurgeService, PURGE_BATCH } from '../photos/photo-purge.service';
import { PRISMA } from '../prisma/prisma.module';

const DAY_MS = 24 * 3600_000;
/** Нэг удаагийн ажиллагаанд боловсруулах эвэнтийн дээд тоо (үлдсэнийг дараагийн цагт) */
const EVENTS_PER_RUN = 20;

export interface RetentionResult {
  expiredEvents: number;
  expiredPhotos: number;
  deletedPhotos: number;
}

/**
 * Хадгалах хугацааны бодлого (docs/ARCHITECTURE.md §6), worker цаг тутам ажиллуулна:
 * - Retention дууссан эвэнт (`expires_at`): бүх зураг, файл, embedding бүрмөсөн устна
 * - Устгасан эвэнт ба soft-delete хийсэн зураг: 30 хоногийн сэргээх хугацааны дараа бүрмөсөн устна
 *
 * Эвэнтийн мөр ба санхүүгийн бүртгэл (захиалга, төлбөр, audit) үлдэнэ — зөвхөн зураг, биометр устна.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly purge: PhotoPurgeService,
  ) {}

  async run(now = new Date()): Promise<RetentionResult> {
    const restoreCutoff = new Date(now.getTime() - SOFT_DELETE_RESTORE_DAYS * DAY_MS);

    // Зурагтай хэвээр байгаа, хугацаа дууссан эсвэл устгаад 30 хоног болсон эвэнтүүд
    const events = await this.prisma.event.findMany({
      where: {
        OR: [{ expiresAt: { lte: now } }, { deletedAt: { lte: restoreCutoff } }],
        photos: { some: {} },
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: EVENTS_PER_RUN,
    });
    let expiredPhotos = 0;
    for (const event of events) {
      // Том эвэнтийг багцаар — нэг транзакц хэт урт болохгүй
      for (;;) {
        const n = await this.purge.purgeEventPhotos(event.id);
        expiredPhotos += n;
        if (n < PURGE_BATCH) break;
      }
    }

    let deletedPhotos = 0;
    for (;;) {
      const photos = await this.prisma.photo.findMany({
        where: { deletedAt: { lte: restoreCutoff } },
        select: { id: true },
        take: PURGE_BATCH,
      });
      deletedPhotos += await this.purge.purge(photos.map((p) => p.id));
      if (photos.length < PURGE_BATCH) break;
    }

    if (events.length || deletedPhotos) {
      this.logger.log(`retention: ${events.length} events (${expiredPhotos} photos), ${deletedPhotos} soft-deleted photos`);
    }
    return { expiredEvents: events.length, expiredPhotos, deletedPhotos };
  }
}
