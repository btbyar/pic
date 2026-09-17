import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@pic/db';
import type { PhotoStorageKeys } from '@pic/shared';
import sharp from 'sharp';
import { type MlFace, MlClient, MlRejectedImageError, toVectorLiteral } from '../ml/ml-client';
import { PRISMA } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.module';
import { PermanentIngestError } from './ingest.service';

/** ML руу илгээх зургийн урт тал. Жижиг (хол зогссон) нүүр олдох ба хурдны тэнцвэр — benchmark/RESULTS.md */
export const ML_IMAGE_MAX_SIDE = 2560;

export type IndexOutcome = 'indexed' | 'skipped';

/**
 * DERIVED → INDEXED: эх зургийг ML сервис рүү илгээж, нүүр бүрийн embedding-ийг biometric schema-д хадгална.
 * Давтан ажиллуулахад аюулгүй: тухайн зураг + model_version-ийн хуучин embedding-ийг орлуулна.
 * Embedding-ийг хэзээ ч log-д бичихгүй.
 */
@Injectable()
export class IndexService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly ml: MlClient,
  ) {}

  async process(photoId: string): Promise<IndexOutcome> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { event: { select: { deletedAt: true, faceSearchEnabled: true } } },
    });
    if (!photo || photo.deletedAt || photo.event.deletedAt || photo.processingStatus !== 'DERIVED') return 'skipped';

    // Нүүрээр хайх унтраасан эвэнт: биометр өгөгдөл огт үүсгэхгүй
    if (!photo.event.faceSearchEnabled) {
      await this.markIndexed(photo.id, 0);
      return 'indexed';
    }

    const original = await this.storage.get('originals', (photo.storageKeys as unknown as PhotoStorageKeys).original);
    // EXIF эргүүлэлтийг хэрэглэж, хэмжээг багасгана — ML сервис EXIF уншдаггүй, том файл сүлжээ удаашруулна
    const { data: image, info } = await sharp(original)
      .rotate()
      .resize(ML_IMAGE_MAX_SIDE, ML_IMAGE_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });

    let result;
    try {
      result = await this.ml.detectFaces(image);
    } catch (err) {
      if (err instanceof MlRejectedImageError) throw new PermanentIngestError(err.message);
      // MlUnavailableError г.м. — дахин оролдоно
      throw err;
    }
    // ML-ийн координат → эх зургийн (эргүүлсэн) координат
    const scale = photo.width ? photo.width / info.width : 1;
    const { faces } = result;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM "biometric"."face_embedding"
        WHERE photo_id = ${photo.id}::uuid AND model_version = ${result.modelVersion}`;
      if (faces.length > 0) {
        const rows = faces.map(
          (f) => Prisma.sql`(
            ${photo.id}::uuid, ${photo.eventId}::uuid, ${toVectorLiteral(f.embedding)}::vector,
            ${JSON.stringify(scaleBox(f, scale))}::jsonb, ${f.detScore}::float8, ${Math.round(f.sizePx)}::int,
            ${f.quality}::float8, ${result.modelVersion}::text
          )`,
        );
        await tx.$executeRaw`
          INSERT INTO "biometric"."face_embedding"
            (id, photo_id, event_id, embedding, bbox, det_score, face_size_px, quality, model_version)
          SELECT gen_random_uuid(), v.* FROM (VALUES ${Prisma.join(rows)})
            AS v(photo_id, event_id, embedding, bbox, det_score, face_size_px, quality, model_version)`;
      }
      await tx.photo.updateMany({
        where: { id: photo.id, processingStatus: 'DERIVED' },
        data: { processingStatus: 'INDEXED', faceCount: faces.length, failureReason: null },
      });
    });
    return 'indexed';
  }

  /**
   * Индексжүүлэлт бүр мөсөн амжилтгүй бол зураг галерейд харагдсаар (DERIVED) үлдэнэ, зөвхөн нүүрээр
   * хайлтад орохгүй. Шалтгааныг админ харж "дахин ажиллуулах" (Phase 6).
   */
  async markFailed(photoId: string, reason: string): Promise<void> {
    await this.prisma.photo.updateMany({
      where: { id: photoId, processingStatus: 'DERIVED' },
      data: { failureReason: `index: ${reason}`.slice(0, 500) },
    });
  }

  private async markIndexed(photoId: string, faceCount: number) {
    await this.prisma.photo.updateMany({
      where: { id: photoId, processingStatus: 'DERIVED' },
      data: { processingStatus: 'INDEXED', faceCount, failureReason: null },
    });
  }
}

function scaleBox(face: MlFace, scale: number) {
  const [x, y, w, h] = face.bbox;
  const r = (v: number) => Math.round(v * scale * 10) / 10;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}
