import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@pic/db';
import { derivativeStorageKey, parseExifDateTime, type PhotoStorageKeys } from '@pic/shared';
import { InvalidImageError, renderDerivatives } from '../media/derivatives';
import { PRISMA } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.module';

/** Дахин оролдох шаардлагагүй алдаа — зураг шууд FAILED болно */
export class PermanentIngestError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'PermanentIngestError';
  }
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

export type IngestOutcome = 'derived' | 'skipped';

/**
 * UPLOADED → DERIVED: эх зургийг шалгаж, thumb/preview үүсгээд pic-public руу хадгална.
 * Давтан ажиллуулахад аюулгүй (idempotent): зөвхөн UPLOADED төлөвтэй зургийг шилжүүлнэ.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  async process(photoId: string): Promise<IngestOutcome> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { event: { select: { timezone: true, deletedAt: true } } },
    });
    if (!photo || photo.deletedAt || photo.event.deletedAt || photo.processingStatus !== 'UPLOADED') return 'skipped';

    const keys = photo.storageKeys as unknown as PhotoStorageKeys;
    const original = await this.storage.get('originals', keys.original);

    // Browser-ийн мэдэгдсэн hash-д итгэхгүй: давхардал илрүүлэлт үүн дээр тулгуурладаг
    const actualSha = createHash('sha256').update(original).digest('hex');
    if (photo.sha256 && actualSha !== photo.sha256) throw new PermanentIngestError('sha256_mismatch');

    let derived;
    try {
      derived = await renderDerivatives(original);
    } catch (err) {
      if (err instanceof InvalidImageError) throw new PermanentIngestError(err.reason);
      throw err;
    }

    const thumbKey = derivativeStorageKey(photo.eventId, photo.id, 'thumb');
    const previewKey = derivativeStorageKey(photo.eventId, photo.id, 'preview');
    await Promise.all([
      this.storage.put('public', thumbKey, derived.thumb.buffer, { contentType: 'image/webp', cacheControl: IMMUTABLE }),
      this.storage.put('public', previewKey, derived.preview.buffer, { contentType: 'image/webp', cacheControl: IMMUTABLE }),
    ]);

    const capturedAtRaw = parseExifDateTime(derived.exif.dateTimeOriginal, derived.exif.offsetTimeOriginal, photo.event.timezone);
    const storageKeys: PhotoStorageKeys = { ...keys, thumb: thumbKey, preview: previewKey };

    // captured_at-ийг SQL дотор зурагчны ОДООГИЙН цагийн засвараар тооцно: боловсруулж байх хооронд
    // засвар өөрчлөгдсөн ч (events.service setMyClockOffset) row lock-оор зөв утга үлдэнэ.
    const updated = await this.prisma.$executeRaw`
      UPDATE "public"."photo" p
      SET processing_status = 'DERIVED'::"ProcessingStatus",
          width = ${derived.width},
          height = ${derived.height},
          captured_at_raw = ${capturedAtRaw},
          captured_at = ${capturedAtRaw}::timestamptz + make_interval(secs => COALESCE((
            SELECT ep.clock_offset_sec FROM "public"."event_photographer" ep
            WHERE ep.event_id = p.event_id AND ep.user_id = p.photographer_id
          ), 0)),
          storage_keys = ${JSON.stringify(storageKeys)}::jsonb,
          failure_reason = NULL,
          updated_at = now()
      WHERE p.id = ${photo.id}::uuid AND p.processing_status = 'UPLOADED'::"ProcessingStatus"`;
    if (updated === 0) return 'skipped';

    // Эвэнтийн анхны боловсруулагдсан зураг нь cover болно (зурагчин дараа нь солих — Phase 6)
    await this.prisma.event.updateMany({
      where: { id: photo.eventId, coverPhotoId: null },
      data: { coverPhotoId: photo.id },
    });
    return 'derived';
  }

  /** Бүх оролдлого дууссан эсвэл засагдахгүй алдаа */
  async markFailed(photoId: string, reason: string): Promise<void> {
    this.logger.warn(`photo ${photoId} failed: ${reason}`);
    await this.prisma.photo.updateMany({
      where: { id: photoId, processingStatus: 'UPLOADED' },
      data: { processingStatus: 'FAILED', failureReason: reason.slice(0, 500) },
    });
  }
}
