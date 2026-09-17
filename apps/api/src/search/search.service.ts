import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PrismaClient } from '@pic/db';
import { CONSENT_VERSION, classifyMatches, pickExpansionSeeds } from '@pic/shared';
import sharp from 'sharp';
import { hashIp } from '../common/crypto';
import { RateLimiter } from '../common/rate-limiter';
import type { Env } from '../config/env';
import { EventsService, PUBLIC_PHOTO_SELECT, type Viewer } from '../events/events.service';
import { MlClient, MlRejectedImageError, toVectorLiteral } from '../ml/ml-client';
import { PRISMA } from '../prisma/prisma.module';
import { SettingsService } from '../settings/settings.service';

/** Селфиг ML руу илгээх хэмжээ — нүүр томоор харагддаг тул бага нягтрал хангалттай */
const SELFIE_MAX_SIDE = 1024;
/** Нэг хэсэгт буцаах дээд тоо (том эвэнтэд нэг хүн ~100 зурагтай байх нь ховор) */
const MAX_RESULTS = 1000;
const RESULTS_READ_RULE = { name: 'search:read', limit: 120, windowSec: 60 };
/**
 * Worker 5 минут тутам хугацаа дууссан embedding-ийг арилгадаг тул expires_at-ийг 24 цагаас 5 минутаар
 * эрт тавина: тохиргоо 24 цаг байсан ч embedding DB-д нийтдээ 24 цагаас удаан үлдэхгүй.
 */
const MAX_EMBEDDING_LIFETIME_MIN = 24 * 60 - 5;

interface MatchRow {
  photo_id: string;
  face_id: string;
  score: number;
}

/**
 * Селфигээр хайх.
 *
 * Нууцлал (docs/ARCHITECTURE.md §4):
 * - Селфи зураг санах ойд л байна (multer memoryStorage), диск/storage/log-д хэзээ ч хадгалахгүй.
 * - Хайлтын embedding нь SearchSession-д ≤24 цаг (DB CHECK), хэрэглэгч өөрөө шууд устгаж болно.
 * - Session нь хэн болохтой холбогдохгүй: IP, cookie, хэрэглэгчийн ID хадгалахгүй. Rate limit нь hash-лагдсан IP-гаар Redis-д.
 * - Хайлт ба үр дүнг тооцох бүх векторын харьцуулалт DB дотор — embedding API руу буцаж ирэхгүй.
 */
@Injectable()
export class SearchService {
  private readonly ipSecret: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly events: EventsService,
    private readonly ml: MlClient,
    private readonly settings: SettingsService,
    private readonly rateLimiter: RateLimiter,
    config: ConfigService<Env, true>,
  ) {
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
  }

  async searchBySelfie(slug: string, viewer: Viewer, selfie: Buffer, ip: string) {
    const settings = await this.settings.all();
    await this.rateLimiter.consume(
      { name: 'search:selfie', limit: settings['search.rateLimitPerMinute'], windowSec: 60 },
      hashIp(ip, this.ipSecret),
    );

    const event = await this.events.findViewableEvent(slug, viewer);
    if (!event.faceSearchEnabled) throw new ConflictException({ statusCode: 409, code: 'face_search_disabled' });

    let jpeg: Buffer;
    try {
      jpeg = await sharp(selfie)
        .rotate()
        .resize(SELFIE_MAX_SIDE, SELFIE_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch {
      throw new UnprocessableEntityException({ statusCode: 422, code: 'invalid_image' });
    }

    let detected;
    try {
      detected = await this.ml.detectFaces(jpeg);
    } catch (err) {
      if (err instanceof MlRejectedImageError) throw new UnprocessableEntityException({ statusCode: 422, code: 'invalid_image' });
      throw new HttpException({ statusCode: 503, code: 'search_unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (detected.faces.length === 0) throw new UnprocessableEntityException({ statusCode: 422, code: 'no_face_found' });
    // Олон нүүртэй селфи (найзтайгаа): хамгийн том нүүрээр хайна
    const face = detected.faces.reduce((a, b) => (b.sizePx > a.sizePx ? b : a));

    const ttlHours = settings['search.sessionTtlHours'];
    const [session] = await this.prisma.$queryRaw<{ id: string; expires_at: Date }[]>`
      INSERT INTO "biometric"."search_session" (id, event_id, query_embedding, consent_version, model_version, expires_at)
      VALUES (gen_random_uuid(), ${event.id}::uuid, ${toVectorLiteral(face.embedding)}::vector, ${CONSENT_VERSION},
              ${detected.modelVersion},
              now() + make_interval(mins => LEAST(${ttlHours * 60}::int, ${MAX_EMBEDDING_LIFETIME_MIN}::int)))
      RETURNING id, expires_at`;

    const results = await this.runSearch(session!.id, event.id, detected.modelVersion);
    await this.prisma.$executeRaw`
      UPDATE "biometric"."search_session" SET result_count = ${results.mine.length + results.maybe.length}
      WHERE id = ${session!.id}::uuid`;

    return {
      sessionId: session!.id,
      expiresAt: session!.expires_at,
      multipleFaces: detected.faces.length > 1,
      modelVersion: detected.modelVersion,
      ...results,
    };
  }

  /** Хуудас дахин ачаалахад: хадгалсан embedding-ээр дахин тооцно (селфи дахин шаардахгүй) */
  async getResults(slug: string, viewer: Viewer, sessionId: string, ip: string) {
    await this.rateLimiter.consume(RESULTS_READ_RULE, hashIp(ip, this.ipSecret));
    const event = await this.events.findViewableEvent(slug, viewer);
    const [session] = await this.prisma.$queryRaw<
      { id: string; expires_at: Date; model_version: string; active: boolean }[]
    >`
      SELECT id, expires_at, model_version, (query_embedding IS NOT NULL AND expires_at > now()) AS active
      FROM "biometric"."search_session" WHERE id = ${sessionId}::uuid AND event_id = ${event.id}::uuid`;
    if (!session) throw new NotFoundException({ statusCode: 404, code: 'search_not_found' });
    if (!session.active) throw new GoneException({ statusCode: 410, code: 'search_expired' });

    const results = await this.runSearch(session.id, event.id, session.model_version);
    return { sessionId: session.id, expiresAt: session.expires_at, multipleFaces: false, ...results };
  }

  /** "Миний хайлтын өгөгдлийг устгах" — embedding-ийг шууд устгана, session-ийг хугацаа дууссан болгоно */
  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "biometric"."search_session" SET query_embedding = NULL, expires_at = LEAST(expires_at, now())
      WHERE id = ${sessionId}::uuid`;
  }

  /**
   * Багц үнийн шалгалт: хайлтын үр дүнгийн (Таны зургууд + Магадгүй) зургийн ID-ууд.
   * Хугацаа дууссан/устгасан/өөр эвэнтийн session бол null. Захиалга session ID-г ХАДГАЛАХГҮЙ.
   */
  async matchedPhotoIds(sessionId: string, eventId: string): Promise<Set<string> | null> {
    const [session] = await this.prisma.$queryRaw<{ model_version: string }[]>`
      SELECT model_version FROM "biometric"."search_session"
      WHERE id = ${sessionId}::uuid AND event_id = ${eventId}::uuid
        AND query_embedding IS NOT NULL AND expires_at > now()`;
    if (!session) return null;
    const { mine, maybe } = await this.classify(sessionId, eventId, session.model_version);
    return new Set([...mine, ...maybe]);
  }

  // ================================================================ дотоод

  private async runSearch(sessionId: string, eventId: string, modelVersion: string) {
    const { mine, maybe } = await this.classify(sessionId, eventId, modelVersion);
    return {
      mine: await this.photos(mine.slice(0, MAX_RESULTS), 'time'),
      maybe: await this.photos(maybe.slice(0, MAX_RESULTS), 'given'),
    };
  }

  private async classify(sessionId: string, eventId: string, modelVersion: string) {
    const settings = await this.settings.all();
    const thresholds = { high: settings['search.thresholdHigh'], low: settings['search.thresholdLow'] };

    const direct = await this.match(
      Prisma.sql`SELECT query_embedding AS v FROM "biometric"."search_session" WHERE id = ${sessionId}::uuid`,
      eventId,
      modelVersion,
      thresholds.low,
    );

    // Өргөтгөл: "Таны зургууд"-ын хамгийн итгэлтэй нүүрүүдээр дахин хайж өөр өнцгийн зургийг олно
    const seeds = pickExpansionSeeds(
      direct.filter((m) => m.score >= thresholds.high),
      settings['search.expansionTopK'],
    );
    const expansion = seeds.length
      ? await this.match(
          Prisma.sql`SELECT embedding AS v FROM "biometric"."face_embedding"
                     WHERE id IN (${Prisma.join(seeds.map((s) => Prisma.sql`${s.face_id}::uuid`))})`,
          eventId,
          modelVersion,
          thresholds.high,
        )
      : [];

    return classifyMatches(
      new Map(direct.map((m) => [m.photo_id, m.score])),
      new Map(expansion.map((m) => [m.photo_id, m.score])),
      thresholds,
    );
  }

  /** Эвэнт доторх бүх нүүртэй exact cosine (HNSW биш — §4). Зураг тус бүрт хамгийн сайн таарсан нүүр. */
  private async match(queries: Prisma.Sql, eventId: string, modelVersion: string, minScore: number) {
    const [minFacePx, minQ] = await Promise.all([this.settings.get('face.minSizePx'), this.settings.get('face.minQuality')]);
    return this.prisma.$queryRaw<MatchRow[]>`
        SELECT photo_id, face_id, score FROM (
          SELECT DISTINCT ON (f.photo_id) f.photo_id, f.id AS face_id, (1 - (f.embedding <=> q.v))::float8 AS score
          FROM "biometric"."face_embedding" f
          JOIN "public"."photo" p ON p.id = f.photo_id
          CROSS JOIN (${queries}) q
          WHERE f.event_id = ${eventId}::uuid
            AND f.model_version = ${modelVersion}
            AND f.face_size_px >= ${minFacePx}
            AND f.quality >= ${minQ}
            AND p.processing_status = 'INDEXED'::"ProcessingStatus"
            AND p.hidden_at IS NULL AND p.deleted_at IS NULL
          ORDER BY f.photo_id, score DESC
        ) best
        WHERE score >= ${minScore}`;
  }

  private async photos(ids: string[], order: 'time' | 'given') {
    if (ids.length === 0) return [];
    const rows = await this.prisma.photo.findMany({ where: { id: { in: ids } }, select: PUBLIC_PHOTO_SELECT });
    if (order === 'time') {
      rows.sort(
        (a, b) =>
          (a.capturedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.capturedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
          a.id.localeCompare(b.id),
      );
    } else {
      const rank = new Map(ids.map((id, i) => [id, i]));
      rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    }
    return rows.map((p) => this.events.toPublicPhoto(p));
  }
}
