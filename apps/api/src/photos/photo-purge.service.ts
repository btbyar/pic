import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { PrismaClient } from '@pic/db';
import type { PhotoStorageKeys } from '@pic/shared';
import { PRISMA } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.module';

/** Нэг дор устгах дээд тоо (retention job багцлан ажиллана) */
export const PURGE_BATCH = 500;

/**
 * Зургийг бүрмөсөн устгах: DB мөр (нүүрний embedding, bib нь FK cascade-ээр), дараа нь storage объектууд.
 *
 * Дараалал чухал: эхлээд мөрийг устгаж, устгагдсан мөрүүдийн түлхүүрээр л объектыг устгана —
 * тасалдвал "мөр байхгүй атлаа файл үлдсэн" гэхээс илүү аюулгүй биш, харин
 * "файл байхгүй атлаа мөр үлдсэн" (галерейд эвдэрсэн зураг) гэсэн байдал үүсэхгүй.
 *
 * Санхүүгийн бүртгэл (`order_item`) `photo_id` нь NULL болж үлдэнэ (файлын нэр snapshot-оор хадгалагдсан).
 */
@Injectable()
export class PhotoPurgeService {
  private readonly logger = new Logger(PhotoPurgeService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  /** `photoIds`-аас бодитоор устгасан зургийн тоо */
  async purge(photoIds: string[]): Promise<number> {
    if (photoIds.length === 0) return 0;
    const deleted = await this.prisma.$queryRaw<{ storage_keys: PhotoStorageKeys }[]>`
      DELETE FROM "public"."photo" WHERE id = ANY(${photoIds}::uuid[]) RETURNING storage_keys`;
    await Promise.all(deleted.map((row) => this.deleteObjects(row.storage_keys)));
    return deleted.length;
  }

  /** Эвэнтийн бүх зургийг устгана (retention дууссан, эвэнт устгасан). Нэг дуудалтад ≤`PURGE_BATCH`. */
  async purgeEventPhotos(eventId: string): Promise<number> {
    const photos = await this.prisma.photo.findMany({ where: { eventId }, select: { id: true }, take: PURGE_BATCH });
    const count = await this.purge(photos.map((p) => p.id));
    if (count) this.logger.log(`event ${eventId}: purged ${count} photos`);
    return count;
  }

  /**
   * Нуусан/устгасан зургийн embedding-ийг шууд арилгана (soft delete-ийн үед ч —
   * сэргээвэл дахин индексжүүлнэ). Хүн устгуулах хүсэлт гаргасан зураг хайлтад дахин гарах эрсдэлгүй.
   */
  async dropEmbeddings(photoIds: string[]): Promise<void> {
    if (photoIds.length === 0) return;
    await this.prisma.$executeRaw`
      DELETE FROM "biometric"."face_embedding" WHERE photo_id = ANY(${photoIds}::uuid[])`;
  }

  private async deleteObjects(keys: PhotoStorageKeys) {
    const jobs: Promise<void>[] = [this.storage.delete('originals', keys.original)];
    for (const key of [keys.thumb, keys.preview, keys.cover]) {
      if (key) jobs.push(this.storage.delete('public', key));
    }
    await Promise.all(jobs);
  }
}

@Global()
@Module({
  providers: [PhotoPurgeService],
  exports: [PhotoPurgeService],
})
export class PhotosModule {}
