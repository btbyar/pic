import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Event, Prisma, type PrismaClient } from '@pic/db';
import {
  computeEventExpiresAt,
  type CreateEventInput,
  type EventCategory,
  type PhotoStorageKeys,
  slugify,
  type UpdateEventInput,
} from '@pic/shared';
import { AuditService } from '../audit/audit.service';
import { isActingAdmin } from '../auth/access-policy';
import type { AuthContext } from '../auth/decorators';
import { randomToken, sha256Hex } from '../common/crypto';
import type { Env } from '../config/env';
import { PRISMA } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.module';
import { canViewEvent } from './event-visibility';

/** Галерейд харагдах зураг: боловсруулсан, нуугаагүй, устгаагүй */
export const VISIBLE_PHOTO: Prisma.PhotoWhereInput = {
  processingStatus: { in: ['DERIVED', 'INDEXED'] },
  hiddenAt: null,
  deletedAt: null,
};

const PUBLIC_PAGE_SIZE = 24;
const PHOTO_PAGE_SIZE = 60;

export type Viewer = { accessToken?: string | undefined; auth?: AuthContext | undefined };

export const PUBLIC_PHOTO_SELECT = { id: true, width: true, height: true, capturedAt: true, storageKeys: true } as const;
type PublicPhotoRow = Prisma.PhotoGetPayload<{ select: typeof PUBLIC_PHOTO_SELECT }>;

@Injectable()
export class EventsService {
  private readonly webOrigin: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.webOrigin = config.get('WEB_ORIGIN', { infer: true });
  }

  // ================================================================ зурагчин

  async create(user: AuthContext, input: CreateEventInput) {
    const expiresAt = computeEventExpiresAt(input.endsAt, 180);
    const link = input.visibility === 'UNLISTED' ? randomToken(24) : null;

    const event = await this.withUniqueSlug(slugify(input.title), (slug) =>
      this.prisma.event.create({
        data: {
          slug,
          title: input.title,
          description: input.description ?? null,
          location: input.location ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timezone: input.timezone,
          category: input.category,
          visibility: input.visibility,
          accessTokenHash: link ? sha256Hex(link) : null,
          pricePerPhoto: input.pricePerPhoto,
          bundlePrice: input.bundlePrice ?? null,
          bibPattern: input.bibPattern ?? null,
          faceSearchEnabled: input.faceSearchEnabled,
          expiresAt,
          ownerId: user.userId,
          photographers: { create: { userId: user.userId } },
        },
      }),
    );
    return { ...(await this.getMine(user, event.id)), ...(link ? { accessLink: this.accessLink(event.slug, link) } : {}) };
  }

  async listMine(user: AuthContext) {
    const events = await this.prisma.event.findMany({
      where: { deletedAt: null, photographers: { some: { userId: user.userId } } },
      include: {
        _count: { select: { photos: { where: { deletedAt: null } } } },
      },
      orderBy: { startsAt: 'desc' },
    });
    const covers = await this.coverUrls(events);
    return events.map((e) => ({ ...this.ownerView(e, user, covers), photoCount: e._count.photos }));
  }

  async getMine(user: AuthContext, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null, photographers: { some: { userId: user.userId } } },
      include: {
        photographers: { include: { user: { select: { id: true, displayName: true, email: true } } } },
        _count: { select: { photos: { where: { deletedAt: null } } } },
      },
    });
    if (!event) throw this.notFound();
    const me = event.photographers.find((p) => p.userId === user.userId)!;
    return {
      ...this.ownerView(event, user, await this.coverUrls([event])),
      photoCount: event._count.photos,
      myClockOffsetSec: me.clockOffsetSec,
      photographers: event.photographers.map((p) => ({
        userId: p.userId,
        displayName: p.user.displayName,
        // Имэйлийг зөвхөн эзэмшигч харна
        email: event.ownerId === user.userId ? p.user.email : undefined,
        isOwner: p.userId === event.ownerId,
      })),
    };
  }

  async update(user: AuthContext, eventId: string, input: UpdateEventInput) {
    const event = await this.requireOwned(user, eventId);

    const startsAt = input.startsAt ?? event.startsAt;
    const endsAt = input.endsAt ?? event.endsAt;
    if (endsAt < startsAt) {
      throw new BadRequestException({ statusCode: 400, code: 'validation_failed', issues: [{ path: 'endsAt', message: 'endsAt must not be before startsAt' }] });
    }

    // Нууц болгож буй бөгөөд холбоос байхгүй бол шинээр үүсгэнэ
    const visibility = input.visibility ?? event.visibility;
    const link = visibility === 'UNLISTED' && !event.accessTokenHash ? randomToken(24) : null;

    const updated = await this.prisma.event.update({
      where: { id: event.id },
      data: {
        ...input,
        ...(input.endsAt ? { expiresAt: computeEventExpiresAt(endsAt, event.retentionDays) } : {}),
        ...(link ? { accessTokenHash: sha256Hex(link) } : {}),
      },
    });
    return { ...(await this.getMine(user, updated.id)), ...(link ? { accessLink: this.accessLink(updated.slug, link) } : {}) };
  }

  /** Нууц холбоосыг шинэчилнэ — хуучин холбоос шууд хүчингүй болно. */
  async rotateAccessLink(user: AuthContext, eventId: string) {
    const event = await this.requireOwned(user, eventId);
    const link = randomToken(24);
    await this.prisma.event.update({ where: { id: event.id }, data: { accessTokenHash: sha256Hex(link) } });
    return { accessLink: this.accessLink(event.slug, link) };
  }

  async softDelete(user: AuthContext, eventId: string) {
    const event = await this.requireOwned(user, eventId);
    const orders = await this.prisma.order.count({ where: { eventId: event.id } });
    if (orders > 0) {
      // Худалдан авалттай эвэнтийг зөвхөн админ устгана (буцаалт, санхүүгийн бүртгэл)
      throw new ConflictException({ statusCode: 409, code: 'event_has_orders' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: event.id }, data: { deletedAt: new Date(), visibility: 'HIDDEN' } });
      await this.audit.log(
        {
          actorId: user.userId,
          actorRole: user.role,
          action: 'event.delete',
          entityType: 'event',
          entityId: event.id,
          before: { title: event.title, visibility: event.visibility },
        },
        tx,
      );
    });
  }

  async addPhotographer(user: AuthContext, eventId: string, email: string) {
    const event = await this.requireOwned(user, eventId);
    const invitee = await this.prisma.user.findFirst({
      where: { email, role: 'PHOTOGRAPHER', status: 'APPROVED', deletedAt: null },
    });
    if (!invitee) throw new NotFoundException({ statusCode: 404, code: 'photographer_not_found' });
    try {
      await this.prisma.eventPhotographer.create({ data: { eventId: event.id, userId: invitee.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ statusCode: 409, code: 'already_member' });
      }
      throw err;
    }
    return this.getMine(user, event.id);
  }

  async removePhotographer(user: AuthContext, eventId: string, photographerId: string) {
    const event = await this.requireOwned(user, eventId);
    if (photographerId === event.ownerId) throw new ConflictException({ statusCode: 409, code: 'cannot_remove_owner' });
    const photos = await this.prisma.photo.count({ where: { eventId: event.id, photographerId, deletedAt: null } });
    if (photos > 0) throw new ConflictException({ statusCode: 409, code: 'photographer_has_photos' });
    const { count } = await this.prisma.eventPhotographer.deleteMany({ where: { eventId: event.id, userId: photographerId } });
    if (count === 0) throw new NotFoundException({ statusCode: 404, code: 'photographer_not_found' });
    return this.getMine(user, event.id);
  }

  /** Гишүүн бүр өөрийн камерын цагийн зөрүүг тохируулна. Phase 2d-ийн pipeline `capturedAt`-д хэрэглэнэ. */
  async setMyClockOffset(user: AuthContext, eventId: string, clockOffsetSec: number) {
    const { count } = await this.prisma.eventPhotographer.updateMany({
      where: { eventId, userId: user.userId, event: { deletedAt: null } },
      data: { clockOffsetSec },
    });
    if (count === 0) throw this.notFound();
    // Аль хэдийн боловсруулсан зургуудын цагийг шинэ засвараар дахин тооцно (EXIF-ийн түүхий цагаас)
    await this.prisma.$executeRaw`
      UPDATE "public"."photo"
      SET captured_at = captured_at_raw + make_interval(secs => ${clockOffsetSec}), updated_at = now()
      WHERE event_id = ${eventId}::uuid AND photographer_id = ${user.userId}::uuid AND captured_at_raw IS NOT NULL`;
    return this.getMine(user, eventId);
  }

  // ================================================================ нийтийн

  async listPublic(query: { cursor?: string | undefined; q?: string | undefined; category?: EventCategory | undefined }) {
    const events = await this.prisma.event.findMany({
      where: {
        visibility: 'PUBLIC',
        deletedAt: null,
        expiresAt: { gt: new Date() },
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.category ? { category: query.category } : {}),
      },
      include: {
        _count: { select: { photos: { where: VISIBLE_PHOTO } } },
      },
      orderBy: [{ featured: 'desc' }, { startsAt: 'desc' }, { id: 'desc' }],
      take: PUBLIC_PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = events.slice(0, PUBLIC_PAGE_SIZE);
    const covers = await this.coverUrls(page);
    return {
      items: page.map((e) => ({ ...this.publicView(e, covers), photoCount: e._count.photos })),
      nextCursor: events.length > PUBLIC_PAGE_SIZE ? page[page.length - 1]!.id : null,
    };
  }

  async getPublic(slug: string, viewer: Viewer) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        photographers: {
          include: {
            user: { select: { displayName: true, status: true, photographerProfile: { select: { slug: true } } } },
          },
        },
        _count: { select: { photos: { where: VISIBLE_PHOTO } } },
      },
    });
    if (!event || !this.canView(event, viewer)) throw this.notFound();

    return {
      ...this.publicView(event, await this.coverUrls([event])),
      photoCount: event._count.photos,
      photographers: event.photographers.map((p) => ({
        name: p.user.displayName,
        // Профайл нь нийтэд нээлттэй (батлагдсан, slug-тай) үед л холбоос
        slug: p.user.status === 'APPROVED' ? (p.user.photographerProfile?.slug ?? null) : null,
      })),
    };
  }

  /** Зурагчны нийтийн профайл дээрх эвэнтүүд (шинээс нь) */
  async listPublicByPhotographer(userId: string) {
    const events = await this.prisma.event.findMany({
      where: {
        visibility: 'PUBLIC',
        deletedAt: null,
        expiresAt: { gt: new Date() },
        photographers: { some: { userId } },
      },
      include: { _count: { select: { photos: { where: VISIBLE_PHOTO } } } },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const covers = await this.coverUrls(events);
    return events.map((e) => ({ ...this.publicView(e, covers), photoCount: e._count.photos }));
  }

  /** Галерей: авсан цагаар эрэмбэлсэн, watermark-тай зургууд. Цаггүй зургууд төгсгөлд. */
  async listPublicPhotos(slug: string, viewer: Viewer, cursor?: string) {
    const event = await this.findViewableEvent(slug, viewer);
    const photos = await this.prisma.photo.findMany({
      where: { eventId: event.id, ...VISIBLE_PHOTO },
      select: PUBLIC_PHOTO_SELECT,
      orderBy: [{ capturedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: PHOTO_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = photos.slice(0, PHOTO_PAGE_SIZE);
    return {
      items: page.map((p) => this.toPublicPhoto(p)),
      nextCursor: photos.length > PHOTO_PAGE_SIZE ? page[page.length - 1]!.id : null,
    };
  }

  /** Нийтийн (эсвэл нууц холбоос/гишүүн/админ) харж болох эвэнт, үгүй бол 404 — байгаа эсэхийг задруулахгүй */
  async findViewableEvent(slug: string, viewer: Viewer): Promise<Event> {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: { photographers: { select: { userId: true } } },
    });
    if (!event || !this.canView(event, viewer)) throw this.notFound();
    return event;
  }

  toPublicPhoto(p: PublicPhotoRow) {
    const keys = p.storageKeys as unknown as PhotoStorageKeys;
    return {
      id: p.id,
      width: p.width,
      height: p.height,
      capturedAt: p.capturedAt,
      thumbUrl: this.storage.publicUrl(keys.thumb!),
      previewUrl: this.storage.publicUrl(keys.preview!),
    };
  }

  // ================================================================ дотоод

  private canView(event: Event & { photographers: { userId: string }[] }, viewer: Viewer): boolean {
    return canViewEvent(event, {
      accessToken: viewer.accessToken,
      isMember: viewer.auth ? event.photographers.some((p) => p.userId === viewer.auth!.userId) : false,
      isAdmin: isActingAdmin(viewer.auth),
    });
  }

  /** Cover зургийн thumb URL (нуусан/устгасан бол орохгүй) */
  private async coverUrls(events: { coverPhotoId: string | null }[]): Promise<Map<string, string>> {
    const ids = events.flatMap((e) => (e.coverPhotoId ? [e.coverPhotoId] : []));
    if (ids.length === 0) return new Map();
    const photos = await this.prisma.photo.findMany({
      where: { id: { in: ids }, ...VISIBLE_PHOTO },
      select: { id: true, storageKeys: true },
    });
    return new Map(
      photos.flatMap((p) => {
        const thumb = (p.storageKeys as unknown as PhotoStorageKeys).thumb;
        return thumb ? [[p.id, this.storage.publicUrl(thumb)] as const] : [];
      }),
    );
  }

  private async requireOwned(user: AuthContext, eventId: string): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { photographers: { where: { userId: user.userId } } },
    });
    // Гишүүн биш бол эвэнт байгаа эсэхийг задруулахгүй
    if (!event || event.photographers.length === 0) throw this.notFound();
    if (event.ownerId !== user.userId) throw new ForbiddenException({ statusCode: 403, code: 'not_event_owner' });
    return event;
  }

  /** Slug давхцвал санамсаргүй дагавар нэмж дахин оролдоно (unique constraint-д найдна, race-д аюулгүй). */
  private async withUniqueSlug<T>(base: string, create: (slug: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 54)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
      try {
        return await create(slug);
      } catch (err) {
        const isSlugConflict =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          JSON.stringify(err.meta ?? {}).includes('slug');
        if (!isSlugConflict) throw err;
      }
    }
    throw new ConflictException({ statusCode: 409, code: 'slug_unavailable' });
  }

  private accessLink(slug: string, token: string): string {
    return `${this.webOrigin}/events/${slug}?t=${token}`;
  }

  private publicView(e: Event, covers: Map<string, string>) {
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      timezone: e.timezone,
      category: e.category,
      featured: e.featured,
      pricePerPhoto: e.pricePerPhoto,
      bundlePrice: e.bundlePrice,
      faceSearchEnabled: e.faceSearchEnabled,
      coverUrl: (e.coverPhotoId && covers.get(e.coverPhotoId)) || null,
    };
  }

  private ownerView(e: Event, user: AuthContext, covers: Map<string, string>) {
    return {
      ...this.publicView(e, covers),
      visibility: e.visibility,
      hasAccessLink: e.accessTokenHash !== null,
      bibPattern: e.bibPattern,
      retentionDays: e.retentionDays,
      expiresAt: e.expiresAt,
      isOwner: e.ownerId === user.userId,
      createdAt: e.createdAt,
    };
  }

  private notFound() {
    return new NotFoundException({ statusCode: 404, code: 'event_not_found' });
  }
}
