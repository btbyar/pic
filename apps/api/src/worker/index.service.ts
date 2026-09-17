import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PrismaClient } from '@pic/db';
import type { PhotoStorageKeys } from '@pic/shared';
import sharp from 'sharp';
import type { Env } from '../config/env';
import { PRISMA } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.module';
import { PermanentIngestError } from './ingest.service';

/** ML руу илгээх зургийн урт тал. Жижиг (хол зогссон) нүүр олдох ба хурдны тэнцвэр — benchmark/RESULTS.md */
export const ML_IMAGE_MAX_SIDE = 2560;
const ML_TIMEOUT_MS = 60_000;
export const EMBEDDING_DIM = 128;

export interface MlFace {
  bbox: [number, number, number, number];
  landmarks: [number, number][];
  detScore: number;
  sizePx: number;
  quality: number;
  embedding: number[];
}

interface MlFacesResponse {
  width: number;
  height: number;
  modelVersion: string;
  faces: MlFace[];
}

export type IndexOutcome = 'indexed' | 'skipped';

/**
 * DERIVED → INDEXED: эх зургийг ML сервис рүү илгээж, нүүр бүрийн embedding-ийг biometric schema-д хадгална.
 * Давтан ажиллуулахад аюулгүй: тухайн зураг + model_version-ийн хуучин embedding-ийг орлуулна.
 * Embedding-ийг хэзээ ч log-д бичихгүй.
 */
@Injectable()
export class IndexService {
  private readonly mlBaseUrl: string;
  private readonly mlToken: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.mlBaseUrl = config.get('ML_BASE_URL', { infer: true }).replace(/\/+$/, '');
    this.mlToken = config.get('ML_SERVICE_TOKEN', { infer: true });
  }

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

    const result = await this.detectFaces(image);
    // ML-ийн координат → эх зургийн (эргүүлсэн) координат
    const scale = photo.width ? photo.width / info.width : 1;
    const faces = result.faces.filter((f) => f.embedding.length === EMBEDDING_DIM);

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

  private async detectFaces(image: Buffer): Promise<MlFacesResponse> {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'photo.jpg');
    const res = await fetch(`${this.mlBaseUrl}/v1/faces`, {
      method: 'POST',
      body: form,
      headers: this.mlToken ? { authorization: `Bearer ${this.mlToken}` } : {},
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
    if (res.status === 422 || res.status === 413) throw new PermanentIngestError(`ml_${res.status}`);
    // 401, 503 (модель ачаалаагүй), 5xx — тохиргоо/түр алдаа, дахин оролдоно
    if (!res.ok) throw new Error(`ML responded ${res.status}`);
    return (await res.json()) as MlFacesResponse;
  }
}

export function toVectorLiteral(embedding: number[]): string {
  if (!embedding.every(Number.isFinite)) throw new Error('embedding contains non-finite values');
  return `[${embedding.join(',')}]`;
}

function scaleBox(face: MlFace, scale: number) {
  const [x, y, w, h] = face.bbox;
  const r = (v: number) => Math.round(v * scale * 10) / 10;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}
