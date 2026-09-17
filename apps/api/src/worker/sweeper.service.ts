import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@pic/db';
import type { PhotoStorageKeys } from '@pic/shared';
import { PRISMA } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.module';

export const STALE_UPLOAD_HOURS = 24;
/** Embedding-гүй session-ийг (зөвхөн тоо: result_count, consent_version) статистикт хадгалах хугацаа */
export const SEARCH_SESSION_RETENTION_DAYS = 30;
const SWEEP_LIMIT = 500;

/**
 * 24 цагаас дээш UPLOADING төлөвт үлдсэн (браузер хаагдсан, дуусгаагүй) зургийг устгана.
 * Эдгээр нь хэзээ ч галерейд харагдаагүй тул soft delete шаардлагагүй.
 */
@Injectable()
export class SweeperService {
  private readonly logger = new Logger(SweeperService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  async sweepStaleUploads(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_UPLOAD_HOURS * 3600_000);
    const stale = await this.prisma.photo.findMany({
      where: { processingStatus: 'UPLOADING', createdAt: { lt: cutoff } },
      select: { id: true },
      take: SWEEP_LIMIT,
    });
    if (stale.length === 0) return 0;

    // Эхлээд мөрийг нөхцөлтэйгөөр устгана: энэ хооронд дуусгасан (UPLOADED болсон) зургийн эх файлыг
    // устгачихгүйн тулд объектыг зөвхөн бодитоор устгагдсан мөрүүдэд устгана.
    const deleted = await this.prisma.$queryRaw<{ storage_keys: PhotoStorageKeys }[]>`
      DELETE FROM "public"."photo"
      WHERE id = ANY(${stale.map((p) => p.id)}::uuid[]) AND processing_status = 'UPLOADING'::"ProcessingStatus"
      RETURNING storage_keys`;
    // Хагас байршсан объект байж болно; байхгүй объектыг устгах нь S3-д алдаа биш
    await Promise.all(deleted.map((p) => this.storage.delete('originals', p.storage_keys.original)));
    this.logger.log(`removed ${deleted.length} stale uploads`);
    return deleted.length;
  }

  /**
   * Хугацаа нь дууссан хайлтын embedding-ийг NULL болгоно (хувийн мэдээллийн шаардлага: ≤24 цаг).
   * Хайлтын API хугацаа дууссан session-ийг аль хэдийн ашиглахгүй; энэ нь DB-ээс бодитоор арилгах алхам.
   */
  async purgeSearchSessions(): Promise<{ cleared: number; deleted: number }> {
    const cleared = await this.prisma.$executeRaw`
      UPDATE "biometric"."search_session" SET query_embedding = NULL
      WHERE query_embedding IS NOT NULL AND expires_at <= now()`;
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "biometric"."search_session"
      WHERE created_at < now() - make_interval(days => ${SEARCH_SESSION_RETENTION_DAYS})`;
    if (cleared || deleted) this.logger.log(`search sessions: cleared ${cleared} embeddings, deleted ${deleted}`);
    return { cleared, deleted };
  }
}
