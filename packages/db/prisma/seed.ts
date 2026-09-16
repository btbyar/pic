// Dev seed. Олон удаа ажиллуулахад аюулгүй (upsert). Production дээр ажиллахгүй.
import { createHash, randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { config } from 'dotenv';
import {
  DEFAULT_PHOTOGRAPHER_SHARE_PCT,
  SYSTEM_SETTING_KEYS,
  computeEventExpiresAt,
  defaultSystemSettings,
} from '@pic/shared';
import { createPrismaClient, type EventVisibility } from '../src/index.js';

config({ path: ['.env', '../../.env'], quiet: true });

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`${name} must be set (min length ${minLength})`);
  }
  return value;
}

// OWASP-ийн argon2id санал болгосон тохиргоо
const hashPassword = (password: string) =>
  hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

interface SeedEvent {
  slug: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  visibility: EventVisibility;
  featured: boolean;
  pricePerPhoto: number;
  bundlePrice: number | null;
  bibPattern: string | null;
}

const EVENTS: SeedEvent[] = [
  {
    slug: 'tuul-trail-run-2026',
    title: 'Туул голын трейл гүйлт 2026',
    location: 'Төв аймаг, Туул гол',
    startsAt: '2026-06-14T07:00:00+08:00',
    endsAt: '2026-06-14T15:00:00+08:00',
    visibility: 'PUBLIC',
    featured: true,
    pricePerPhoto: 15_000,
    bundlePrice: 60_000,
    bibPattern: '^[0-9]{3,5}$',
  },
  {
    slug: 'graduation-2026-school-12',
    title: 'Төгсөлтийн баяр 2026 — 12-р сургууль',
    location: 'Улаанбаатар',
    startsAt: '2026-06-20T10:00:00+08:00',
    endsAt: '2026-06-20T18:00:00+08:00',
    visibility: 'UNLISTED',
    featured: false,
    pricePerPhoto: 10_000,
    bundlePrice: 40_000,
    bibPattern: null,
  },
  {
    slug: 'spring-music-fest-2026',
    title: 'Хаврын хөгжмийн наадам 2026',
    location: 'Улаанбаатар, Сүхбаатарын талбай',
    startsAt: '2026-09-26T16:00:00+08:00',
    endsAt: '2026-09-26T23:00:00+08:00',
    visibility: 'HIDDEN',
    featured: false,
    pricePerPhoto: 12_000,
    bundlePrice: null,
    bibPattern: null,
  },
];

async function main() {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Seed must not run in production');
  }

  const prisma = createPrismaClient(requireEnv('DATABASE_URL'));
  try {
    const adminEmail = requireEnv('SEED_ADMIN_EMAIL').toLowerCase();
    const adminPasswordHash = await hashPassword(requireEnv('SEED_ADMIN_PASSWORD', 12));
    const photographerPasswordHash = await hashPassword(requireEnv('SEED_PHOTOGRAPHER_PASSWORD', 12));

    // Админ — TOTP идэвхгүй; анх нэвтрэхэд заавал бүртгүүлнэ (Phase 2/6)
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        status: 'APPROVED',
        displayName: 'Систем админ',
      },
    });

    const approved = await prisma.user.upsert({
      where: { email: 'bat@pic.local' },
      update: {},
      create: {
        email: 'bat@pic.local',
        passwordHash: photographerPasswordHash,
        role: 'PHOTOGRAPHER',
        status: 'APPROVED',
        displayName: 'Бат-Эрдэнэ (зурагчин)',
        phone: '+97699000001',
        photographerProfile: {
          create: {
            revenueSharePct: DEFAULT_PHOTOGRAPHER_SHARE_PCT,
            approvedById: admin.id,
            approvedAt: new Date(),
          },
        },
      },
    });

    // Батлагдаагүй зурагчин — админ панелийн "хүлээгдэж буй" жагсаалтыг шалгахад
    await prisma.user.upsert({
      where: { email: 'saraa@pic.local' },
      update: {},
      create: {
        email: 'saraa@pic.local',
        passwordHash: photographerPasswordHash,
        role: 'PHOTOGRAPHER',
        status: 'PENDING',
        displayName: 'Сараа (шинэ зурагчин)',
        photographerProfile: { create: {} },
      },
    });

    const unlistedLinks: string[] = [];

    for (const e of EVENTS) {
      const startsAt = new Date(e.startsAt);
      const endsAt = new Date(e.endsAt);
      // UNLISTED холбоосны токен: DB-д зөвхөн hash. Seed бүрт шинэчилж хэвлэнэ.
      const token = e.visibility === 'UNLISTED' ? randomBytes(24).toString('base64url') : null;
      const data = {
        title: e.title,
        location: e.location,
        startsAt,
        endsAt,
        visibility: e.visibility,
        featured: e.featured,
        pricePerPhoto: e.pricePerPhoto,
        bundlePrice: e.bundlePrice,
        bibPattern: e.bibPattern,
        expiresAt: computeEventExpiresAt(endsAt, 180),
        accessTokenHash: token ? sha256(token) : null,
      };

      const event = await prisma.event.upsert({
        where: { slug: e.slug },
        update: data,
        create: { ...data, slug: e.slug, ownerId: approved.id },
      });

      await prisma.eventPhotographer.upsert({
        where: { eventId_userId: { eventId: event.id, userId: approved.id } },
        update: {},
        create: { eventId: event.id, userId: approved.id },
      });

      if (token) unlistedLinks.push(`/events/${e.slug}?t=${token}`);
    }

    // Админ өөрчилсөн утгыг дарж бичихгүй (update: {})
    const defaults = defaultSystemSettings();
    for (const key of SYSTEM_SETTING_KEYS) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: {},
        create: { key, value: defaults[key] },
      });
    }

    console.log('Seed done:');
    console.log(`  admin:         ${adminEmail}`);
    console.log('  photographers: bat@pic.local (APPROVED), saraa@pic.local (PENDING)');
    console.log(`  events:        ${EVENTS.length}`);
    console.log(`  settings:      ${SYSTEM_SETTING_KEYS.length}`);
    for (const link of unlistedLinks) console.log(`  unlisted link: ${link}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
