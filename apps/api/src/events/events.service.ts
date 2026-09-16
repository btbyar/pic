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
import { computeEventExpiresAt, type CreateEventInput, slugify, type UpdateEventInput } from '@pic/shared';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/decorators';
import { randomToken, sha256Hex } from '../common/crypto';
import type { Env } from '../config/env';
import { PRISMA } from '../prisma/prisma.module';
import { canViewEvent } from './event-visibility';

/** Галерейд харагдах зураг: боловсруулсан, нуугаагүй, устгаагүй */
const VISIBLE_PHOTO: Prisma.PhotoWhereInput = {
  processingStatus: { in: ['DERIVED', 'INDEXED'] },
  hiddenAt: null,
  deletedAt: null,
};

const PUBLIC_PAGE_SIZE = 24;

@Injectable()
export class EventsService {
  private readonly webOrigin: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
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
    return events.map((e) => ({ ...this.ownerView(e, user), photoCount: e._count.photos }));
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
      ...this.ownerView(event, user),
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
    // TODO(Phase 2d): аль хэдийн байршуулсан зургуудын captured_at-ийг дахин тооцоолох
    return this.getMine(user, eventId);
  }

  // ================================================================ нийтийн

  async listPublic(query: { cursor?: string | undefined; q?: string | undefined }) {
    const events = await this.prisma.event.findMany({
      where: {
        visibility: 'PUBLIC',
        deletedAt: null,
        expiresAt: { gt: new Date() },
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      include: {
        _count: { select: { photos: { where: VISIBLE_PHOTO } } },
      },
      orderBy: [{ featured: 'desc' }, { startsAt: 'desc' }, { id: 'desc' }],
      take: PUBLIC_PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = events.slice(0, PUBLIC_PAGE_SIZE);
    return {
      items: page.map((e) => ({ ...this.publicView(e), photoCount: e._count.photos })),
      nextCursor: events.length > PUBLIC_PAGE_SIZE ? page[page.length - 1]!.id : null,
    };
  }

  async getPublic(slug: string, viewer: { accessToken?: string | undefined; auth?: AuthContext | undefined }) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        photographers: { include: { user: { select: { displayName: true } } } },
        _count: { select: { photos: { where: VISIBLE_PHOTO } } },
      },
    });
    if (!event) throw this.notFound();

    const allowed = canViewEvent(event, {
      accessToken: viewer.accessToken,
      isMember: viewer.auth ? event.photographers.some((p) => p.userId === viewer.auth!.userId) : false,
      isAdmin: viewer.auth?.role === 'ADMIN' && viewer.auth.mfaPassed,
    });
    if (!allowed) throw this.notFound();

    return {
      ...this.publicView(event),
      photoCount: event._count.photos,
      photographers: event.photographers.map((p) => p.user.displayName),
    };
  }

  // ================================================================ дотоод

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

  private publicView(e: Event) {
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      timezone: e.timezone,
      featured: e.featured,
      pricePerPhoto: e.pricePerPhoto,
      bundlePrice: e.bundlePrice,
      faceSearchEnabled: e.faceSearchEnabled,
      // TODO(Phase 2d): cover зургийн preview URL
      coverUrl: null as string | null,
    };
  }

  private ownerView(e: Event, user: AuthContext) {
    return {
      ...this.publicView(e),
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
