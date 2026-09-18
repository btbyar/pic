import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, PrismaClient, RemovalStatus } from '@pic/db';
import type { PhotoStorageKeys, RemovalResolution } from '@pic/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/decorators';
import { hashIp } from '../common/crypto';
import type { Env } from '../config/env';
import { PhotoPurgeService } from '../photos/photo-purge.service';
import { ADMIN_PRISMA } from '../prisma/prisma.module';
import { PHOTO_INDEX_QUEUE, type PhotoIndexQueue } from '../queue/queue.module';
import { StorageService } from '../storage/storage.module';

const PAGE_SIZE = 50;

const REMOVAL_LIST_SELECT = {
  id: true,
  reason: true,
  contact: true,
  status: true,
  resolution: true,
  createdAt: true,
  resolvedAt: true,
  photoId: true,
} satisfies Prisma.RemovalRequestSelect;

/**
 * Админы модерац: устгуулах хүсэлт, зураг нуух/устгах.
 *
 * Уншилт, бүртгэл `pic_admin_role`-оор (биометрийн schema-д эрхгүй) явна. Нүүрний embedding-ийг
 * устгах нь `PhotoPurgeService`-ээр (app role) — админ модуль биометрийн өгөгдлийг **харж** чадахгүй,
 * зөвхөн "устга" гэж хэлж чадна.
 */
@Injectable()
export class ModerationService {
  private readonly ipSecret: string;

  constructor(
    @Inject(ADMIN_PRISMA) private readonly prisma: PrismaClient,
    private readonly purge: PhotoPurgeService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(PHOTO_INDEX_QUEUE) private readonly indexQueue: PhotoIndexQueue,
    config: ConfigService<Env, true>,
  ) {
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
  }

  // ================================================================ устгуулах хүсэлт

  async listRemovalRequests(status: RemovalStatus | undefined, cursor: string | undefined) {
    const rows = await this.prisma.removalRequest.findMany({
      where: status ? { status } : {},
      select: { ...REMOVAL_LIST_SELECT, photo: { select: { id: true, storageKeys: true, hiddenAt: true, deletedAt: true, eventId: true, event: { select: { title: true, slug: true } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map((r) => {
        const keys = r.photo?.storageKeys as PhotoStorageKeys | undefined;
        return {
          id: r.id,
          reason: r.reason,
          contact: r.contact,
          status: r.status,
          resolution: r.resolution,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          photo: r.photo
            ? {
                id: r.photo.id,
                eventTitle: r.photo.event.title,
                eventSlug: r.photo.event.slug,
                hidden: r.photo.hiddenAt !== null || r.photo.deletedAt !== null,
                // Админ watermark-тай preview-г л харна (эх зураг биш)
                previewUrl: keys?.preview ? this.storage.publicUrl(keys.preview) : null,
              }
            : null,
        };
      }),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null,
    };
  }

  /**
   * Хүсэлтийг шийдвэрлэнэ:
   * - `hide`   — зургийг галерей, хайлтаас нуух (эргүүлж болно), embedding шууд устана
   * - `delete` — зургийг бүрмөсөн устгах (файл + embedding). Санхүүгийн бүртгэл үлдэнэ
   * - `reject` — хүсэлтийг хүлээж авахгүй (шалтгаантай)
   */
  async resolveRemovalRequest(
    admin: AuthContext,
    id: string,
    input: { action: RemovalResolution; note: string | undefined },
    ip: string,
  ) {
    const request = await this.prisma.removalRequest.findUnique({ where: { id }, include: { photo: true } });
    if (!request) throw new NotFoundException({ statusCode: 404, code: 'removal_request_not_found' });
    if (request.status === 'RESOLVED' || request.status === 'REJECTED') {
      throw new ConflictException({ statusCode: 409, code: 'invalid_status_transition' });
    }

    if (input.action !== 'reject' && request.photo) {
      if (input.action === 'hide') await this.hidePhoto(admin, request.photo.id, 'removal_request', ip);
      else await this.deletePhoto(admin, request.photo.id, ip);
    }

    const status: RemovalStatus = input.action === 'reject' ? 'REJECTED' : 'RESOLVED';
    const updated = await this.prisma.removalRequest.update({
      where: { id },
      data: {
        status,
        resolution: input.note ? `${input.action}: ${input.note}` : input.action,
        handledById: admin.userId,
        resolvedAt: new Date(),
      },
      select: REMOVAL_LIST_SELECT,
    });
    await this.audit.log({
      actorId: admin.userId,
      actorRole: admin.role,
      action: `removal.${input.action}`,
      entityType: 'removal_request',
      entityId: id,
      before: { status: request.status },
      after: { status },
      ...(input.note ? { reason: input.note } : {}),
      ipHash: hashIp(ip, this.ipSecret),
    });
    return updated;
  }

  // ================================================================ зураг

  /** Нуусан зураг галерей, хайлт, татахад гарахгүй. Худалдан авалтын түүх хэвээр. */
  async hidePhoto(admin: AuthContext, photoId: string, reason: string, ip: string) {
    const photo = await this.requirePhoto(photoId);
    if (!photo.hiddenAt) {
      await this.prisma.photo.update({ where: { id: photoId }, data: { hiddenAt: new Date(), hiddenReason: reason } });
    }
    // Нуусан зураг хайлтад дахин гарах эрсдэлгүй байхаар embedding-ийг шууд устгана
    await this.purge.dropEmbeddings([photoId]);
    await this.prisma.photo.updateMany({
      where: { id: photoId, processingStatus: 'INDEXED' },
      data: { processingStatus: 'DERIVED', faceCount: 0 },
    });
    await this.audit.log({
      actorId: admin.userId,
      actorRole: admin.role,
      action: 'photo.hide',
      entityType: 'photo',
      entityId: photoId,
      before: { hidden: photo.hiddenAt !== null },
      after: { hidden: true },
      reason,
      ipHash: hashIp(ip, this.ipSecret),
    });
    return { id: photoId, hidden: true };
  }

  /** Нуултыг буцаана. Нүүрийг дахин индексжүүлэх шаардлагатай (worker дахин ажиллуулна). */
  async unhidePhoto(admin: AuthContext, photoId: string, ip: string) {
    const photo = await this.requirePhoto(photoId);
    await this.prisma.photo.update({ where: { id: photoId }, data: { hiddenAt: null, hiddenReason: null } });
    if (photo.processingStatus === 'DERIVED') {
      // Нуух үед устгасан embedding-ийг сэргээнэ
      await this.indexQueue.add('index', { photoId }, { jobId: `reindex-${photoId}-${Date.now()}` });
    }
    await this.audit.log({
      actorId: admin.userId,
      actorRole: admin.role,
      action: 'photo.unhide',
      entityType: 'photo',
      entityId: photoId,
      before: { hidden: photo.hiddenAt !== null, hiddenReason: photo.hiddenReason },
      after: { hidden: false },
      ipHash: hashIp(ip, this.ipSecret),
    });
    return { id: photoId, hidden: false };
  }

  /** Бүрмөсөн устгана: файл, embedding, мөр. Буцаах боломжгүй (audit log-д үлдэнэ). */
  async deletePhoto(admin: AuthContext, photoId: string, ip: string) {
    const photo = await this.requirePhoto(photoId);
    await this.audit.log({
      actorId: admin.userId,
      actorRole: admin.role,
      action: 'photo.delete',
      entityType: 'photo',
      entityId: photoId,
      before: { eventId: photo.eventId, filename: photo.originalFilename, photographerId: photo.photographerId },
      ipHash: hashIp(ip, this.ipSecret),
    });
    await this.purge.purge([photoId]);
    return { id: photoId, deleted: true };
  }

  private async requirePhoto(photoId: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException({ statusCode: 404, code: 'photo_not_found' });
    return photo;
  }
}
