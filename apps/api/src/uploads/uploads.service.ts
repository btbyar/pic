import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient, UploadBatch } from '@pic/db';
import {
  type CompletedUpload,
  originalStorageKey,
  type ProcessingStatus,
  PROCESSING_STATUSES,
  type RegisteredUpload,
  UPLOAD_CONTENT_TYPES,
  type UploadFileInput,
} from '@pic/shared';
import type { AuthContext } from '../auth/decorators';
import { uuidv7 } from '../common/crypto';
import { PRISMA } from '../prisma/prisma.module';
import { PHOTO_INGEST_QUEUE, type PhotoIngestQueue } from '../queue/queue.module';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.module';

/** Chunk бүрийг бүртгэснээс хойш байршуулж дуусгах хугацаа */
const PRESIGN_TTL_SEC = 30 * 60;

interface StorageKeys {
  original: string;
}

/**
 * Олон зураг байршуулах урсгал (Phase 2c):
 * 1. batch үүсгэх → 2. файлуудыг 100-аар бүртгэж presigned URL авах → 3. браузер шууд storage руу PUT →
 * 4. complete: объект байгаа, хэмжээ таарч буйг шалгаад UPLOADED болгож ingest job үүсгэнэ.
 *
 * Үргэлжлүүлэх: tab хаагдсан бол зурагчин ижил файлуудаа дахин сонгоно. SHA-256 давхардлаар
 * дууссан файлууд алгасагдаж, тасалдсан (UPLOADING) файлуудад шинэ URL олгогдоно.
 */
@Injectable()
export class UploadsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PHOTO_INGEST_QUEUE) private readonly ingestQueue: PhotoIngestQueue,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
  ) {}

  async createBatch(user: AuthContext, eventId: string, totalFiles: number) {
    await this.requireMembership(user, eventId);
    const batch = await this.prisma.uploadBatch.create({
      data: { eventId, photographerId: user.userId, totalFiles },
    });
    return {
      id: batch.id,
      eventId,
      totalFiles,
      maxFileSizeBytes: await this.maxFileSizeBytes(),
      contentTypes: UPLOAD_CONTENT_TYPES,
    };
  }

  async registerFiles(user: AuthContext, batchId: string, files: UploadFileInput[]): Promise<RegisteredUpload[]> {
    const batch = await this.requireBatch(user, batchId);

    const maxBytes = await this.maxFileSizeBytes();
    const tooLarge = files.flatMap((f, i) => (f.size > maxBytes ? [{ path: `files.${i}.size`, message: 'file_too_large' }] : []));
    if (tooLarge.length) {
      throw new BadRequestException({ statusCode: 400, code: 'file_too_large', maxFileSizeBytes: maxBytes, issues: tooLarge });
    }

    // Ижил хүсэлт дотор давхардсан файл: эхнийхийг л байршуулна
    const firstIndexBySha = new Map<string, number>();
    files.forEach((f, i) => {
      if (!firstIndexBySha.has(f.sha256)) firstIndexBySha.set(f.sha256, i);
    });

    // ON CONFLICT DO NOTHING — зэрэг ирсэн хүсэлтүүд ч (event_id, sha256) unique-д найдаж аюулгүй
    await this.prisma.photo.createMany({
      data: [...firstIndexBySha.values()].map((i) => {
        const f = files[i]!;
        const id = uuidv7();
        return {
          id,
          eventId: batch.eventId,
          photographerId: user.userId,
          uploadBatchId: batch.id,
          originalFilename: f.name,
          storageKeys: { original: originalStorageKey(batch.eventId, id, f.type) } satisfies StorageKeys,
          bytes: BigInt(f.size),
          sha256: f.sha256,
        };
      }),
      skipDuplicates: true,
    });

    const rows = await this.prisma.photo.findMany({
      where: { eventId: batch.eventId, sha256: { in: [...firstIndexBySha.keys()] } },
      select: { id: true, sha256: true, photographerId: true, processingStatus: true, deletedAt: true, storageKeys: true, bytes: true },
    });
    const rowBySha = new Map(rows.map((r) => [r.sha256!, r]));

    // Өмнө тасалдсан өөрийн файлыг энэ batch руу шилжүүлнэ (complete нь batch-аар шалгадаг)
    const resumable = rows.filter((r) => this.isResumable(r, user)).map((r) => r.id);
    if (resumable.length) {
      await this.prisma.photo.updateMany({
        where: { id: { in: resumable }, processingStatus: 'UPLOADING' },
        data: { uploadBatchId: batch.id },
      });
    }

    return Promise.all(
      files.map(async (f, index): Promise<RegisteredUpload> => {
        const row = rowBySha.get(f.sha256);
        if (!row) throw new Error(`photo row for sha256 ${f.sha256} disappeared`);
        if (firstIndexBySha.get(f.sha256) !== index || !this.isResumable(row, user)) {
          return { index, status: 'duplicate', photoId: row.id };
        }
        const { url, headers } = await this.storage.presignPut('originals', (row.storageKeys as unknown as StorageKeys).original, {
          contentType: f.type,
          contentLength: Number(row.bytes),
          expiresInSec: PRESIGN_TTL_SEC,
        });
        return { index, status: 'upload', photoId: row.id, url, headers };
      }),
    );
  }

  async complete(user: AuthContext, batchId: string, photoIds: string[]): Promise<CompletedUpload[]> {
    const batch = await this.requireBatch(user, batchId);
    const ids = [...new Set(photoIds)];
    const rows = await this.prisma.photo.findMany({
      where: { id: { in: ids }, uploadBatchId: batch.id, photographerId: user.userId, deletedAt: null },
      select: { id: true, processingStatus: true, storageKeys: true, bytes: true },
    });
    const rowById = new Map(rows.map((r) => [r.id, r]));

    const results = await Promise.all(
      ids.map(async (photoId): Promise<CompletedUpload> => {
        const row = rowById.get(photoId);
        if (!row) return { photoId, status: 'not_found' };
        // Давтан дуудлага аюулгүй
        if (row.processingStatus !== 'UPLOADING') return { photoId, status: 'uploaded' };

        const key = (row.storageKeys as unknown as StorageKeys).original;
        const object = await this.storage.head('originals', key);
        if (!object) return { photoId, status: 'missing' };
        if (BigInt(object.size) !== row.bytes) {
          // Signature нь хэмжээг хамгаалдаг ч storage бүр мөрдөхгүй байж болзошгүй — дахин байршуулуулна
          await this.storage.delete('originals', key);
          return { photoId, status: 'size_mismatch' };
        }
        return { photoId, status: 'uploaded' };
      }),
    );

    const verified = results.filter((r) => r.status === 'uploaded' && rowById.get(r.photoId)?.processingStatus === 'UPLOADING');
    if (verified.length) {
      await this.prisma.photo.updateMany({
        where: { id: { in: verified.map((r) => r.photoId) }, processingStatus: 'UPLOADING' },
        data: { processingStatus: 'UPLOADED' },
      });
      // jobId = photoId: давхар complete ирсэн ч нэг л job үүснэ
      await this.ingestQueue.addBulk(
        verified.map((r) => ({ name: 'ingest', data: { photoId: r.photoId }, opts: { jobId: r.photoId } })),
      );
    }
    return results;
  }

  /** Байршуулах хуудсанд харуулах эвэнтийн нийт тоо (бүх зурагчны) */
  async photoStats(user: AuthContext, eventId: string) {
    await this.requireMembership(user, eventId);
    const groups = await this.prisma.photo.groupBy({
      by: ['processingStatus'],
      where: { eventId, deletedAt: null },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(PROCESSING_STATUSES.map((s) => [s, 0])) as Record<ProcessingStatus, number>;
    for (const g of groups) byStatus[g.processingStatus] = g._count._all;
    return { total: groups.reduce((sum, g) => sum + g._count._all, 0), byStatus };
  }

  // ================================================================ дотоод

  private isResumable(row: { photographerId: string; processingStatus: string; deletedAt: Date | null }, user: AuthContext) {
    return row.photographerId === user.userId && row.processingStatus === 'UPLOADING' && row.deletedAt === null;
  }

  private async maxFileSizeBytes() {
    return (await this.settings.get('upload.maxFileSizeMb')) * 1024 * 1024;
  }

  private async requireMembership(user: AuthContext, eventId: string) {
    const member = await this.prisma.eventPhotographer.findFirst({
      where: { eventId, userId: user.userId, event: { deletedAt: null } },
    });
    if (!member) throw new NotFoundException({ statusCode: 404, code: 'event_not_found' });
  }

  /** Batch нь энэ зурагчных бөгөөд тэр одоо ч эвэнтийн гишүүн байх ёстой */
  private async requireBatch(user: AuthContext, batchId: string): Promise<UploadBatch> {
    const batch = await this.prisma.uploadBatch.findFirst({
      where: {
        id: batchId,
        photographerId: user.userId,
        event: { deletedAt: null, photographers: { some: { userId: user.userId } } },
      },
    });
    if (!batch) throw new NotFoundException({ statusCode: 404, code: 'upload_batch_not_found' });
    return batch;
  }
}
