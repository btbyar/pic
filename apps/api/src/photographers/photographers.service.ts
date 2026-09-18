import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@pic/db';
import { AVATAR_SIZE_PX, slugify, type UpdateProfileInput } from '@pic/shared';
import type { Redis } from 'ioredis';
import sharp from 'sharp';
import type { AuthContext } from '../auth/decorators';
import { randomToken } from '../common/crypto';
import { EventsService, VISIBLE_PHOTO } from '../events/events.service';
import { PRISMA } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { StorageService } from '../storage/storage.module';

const STATS_KEY = 'cache:home-stats';
const STATS_TTL_SEC = 600;
const BIO_PREVIEW_CHARS = 160;

/** Нийтэд харагдах зурагчин: батлагдсан, түр хаагдаагүй, профайлын slug-тай */
const PUBLIC_PHOTOGRAPHER: Prisma.PhotographerProfileWhereInput = {
  slug: { not: null },
  user: { status: 'APPROVED', deletedAt: null },
};

/** Нийтийн эвэнт: PUBLIC, хугацаа дуусаагүй, устгаагүй */
const publicEvent = (): Prisma.EventWhereInput => ({ visibility: 'PUBLIC', deletedAt: null, expiresAt: { gt: new Date() } });

@Injectable()
export class PhotographersService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly storage: StorageService,
    private readonly events: EventsService,
  ) {}

  // ================================================================ өөрийн профайл

  async getMine(user: AuthContext) {
    const profile = await this.prisma.photographerProfile.findUniqueOrThrow({
      where: { userId: user.userId },
      include: { user: { select: { displayName: true } } },
    });
    return {
      displayName: profile.user.displayName,
      // Анх засахад нэрнээс санал болгоно
      slug: profile.slug ?? slugify(profile.user.displayName),
      slugSaved: profile.slug !== null,
      city: profile.city,
      bio: profile.bio,
      avatarUrl: profile.avatarKey ? this.storage.publicUrl(profile.avatarKey) : null,
    };
  }

  async updateMine(user: AuthContext, input: UpdateProfileInput) {
    try {
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: user.userId }, data: { displayName: input.displayName } }),
        this.prisma.photographerProfile.update({
          where: { userId: user.userId },
          data: { slug: input.slug, city: input.city || null, bio: input.bio || null },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ statusCode: 409, code: 'slug_taken' });
      }
      throw err;
    }
    return this.getMine(user);
  }

  /** Профайлын зураг: 256px дөрвөлжин WebP, metadata хасна. Хуучныг устгана. */
  async setAvatar(user: AuthContext, file: Buffer) {
    let webp: Buffer;
    try {
      webp = await sharp(file)
        .rotate()
        .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: 'cover', position: 'attention' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new UnprocessableEntityException({ statusCode: 422, code: 'invalid_image' });
    }
    // Таамаглах боломжгүй түлхүүр — шинэ зураг бүр шинэ URL (CDN cache асуудалгүй)
    const key = `avatars/${user.userId}/${randomToken(12)}.webp`;
    await this.storage.put('public', key, webp, { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' });
    const profile = await this.prisma.photographerProfile.findUniqueOrThrow({ where: { userId: user.userId } });
    await this.prisma.photographerProfile.update({ where: { userId: user.userId }, data: { avatarKey: key } });
    if (profile.avatarKey) await this.storage.delete('public', profile.avatarKey).catch(() => undefined);
    return { avatarUrl: this.storage.publicUrl(key) };
  }

  // ================================================================ нийтийн

  /** `q` — нэр эсвэл хотоор хайх (оролцогч эвэнтээ зурагчнаар нь олно) */
  async list(q?: string) {
    const profiles = await this.prisma.photographerProfile.findMany({
      where: {
        ...PUBLIC_PHOTOGRAPHER,
        ...(q
          ? {
              OR: [
                { user: { displayName: { contains: q, mode: 'insensitive' } } },
                { city: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        userId: true,
        slug: true,
        city: true,
        bio: true,
        avatarKey: true,
        user: { select: { displayName: true, _count: { select: { eventPhotographers: { where: { event: publicEvent() } } } } } },
      },
      take: 500,
    });
    const covers = await this.latestCovers(profiles.map((p) => p.userId));
    return profiles
      .map((p) => ({
        slug: p.slug!,
        displayName: p.user.displayName,
        city: p.city,
        // Картанд 2 мөр л харагдана — бүтэн bio-г жагсаалтаар илгээхгүй
        bio: p.bio ? p.bio.slice(0, BIO_PREVIEW_CHARS) : null,
        avatarUrl: p.avatarKey ? this.storage.publicUrl(p.avatarKey) : null,
        coverUrl: covers.get(p.userId) ?? null,
        eventCount: p.user._count.eventPhotographers,
      }))
      .sort((a, b) => b.eventCount - a.eventCount || a.displayName.localeCompare(b.displayName, 'mn'));
  }

  /** Зурагчин бүрийн хамгийн сүүлийн нийтийн эвэнтийн cover (картын баннер). Нэг query. */
  private async latestCovers(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.eventPhotographer.findMany({
      where: { userId: { in: userIds }, event: { ...publicEvent(), coverPhotoId: { not: null } } },
      orderBy: [{ event: { startsAt: 'desc' } }],
      distinct: ['userId'],
      select: { userId: true, event: { select: { coverPhotoId: true } } },
    });
    const urls = await this.events.coverUrls(rows.map((r) => r.event));
    return new Map(rows.flatMap((r) => {
      const url = urls.get(r.event.coverPhotoId!)?.thumb;
      return url ? [[r.userId, url] as const] : [];
    }));
  }

  async get(slug: string) {
    const profile = await this.prisma.photographerProfile.findFirst({
      where: { ...PUBLIC_PHOTOGRAPHER, slug },
      include: { user: { select: { id: true, displayName: true } } },
    });
    if (!profile) throw new NotFoundException({ statusCode: 404, code: 'photographer_not_found' });
    const events = await this.events.listPublicByPhotographer(profile.userId);
    return {
      slug: profile.slug!,
      displayName: profile.user.displayName,
      city: profile.city,
      bio: profile.bio,
      avatarUrl: profile.avatarKey ? this.storage.publicUrl(profile.avatarKey) : null,
      photoCount: await this.prisma.photo.count({ where: { photographerId: profile.userId, ...VISIBLE_PHOTO, event: publicEvent() } }),
      events,
    };
  }

  /** Нүүр хуудасны тоо. 10 минут cache — нүүр хуудас бүрт COUNT хийхгүй. */
  async stats() {
    const cached = await this.redis.get(STATS_KEY);
    if (cached) return JSON.parse(cached) as { events: number; photos: number; photographers: number };
    const [events, photos, photographers] = await Promise.all([
      this.prisma.event.count({ where: publicEvent() }),
      this.prisma.photo.count({ where: { ...VISIBLE_PHOTO, event: publicEvent() } }),
      this.prisma.user.count({ where: { role: 'PHOTOGRAPHER', status: 'APPROVED', deletedAt: null } }),
    ]);
    const stats = { events, photos, photographers };
    await this.redis.set(STATS_KEY, JSON.stringify(stats), 'EX', STATS_TTL_SEC);
    return stats;
  }
}
