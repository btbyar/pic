import { createHash } from 'node:crypto';
import type { RegisteredUpload } from '@pic/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MlClient } from '../src/ml/ml-client';
import { StorageService } from '../src/storage/storage.module';
import { IndexService } from '../src/worker/index.service';
import { IngestService } from '../src/worker/ingest.service';
import { SweeperService } from '../src/worker/sweeper.service';
import { FAKE_MODEL_VERSION, FakeMl, fakeFace, vec } from './fake-ml';
import { type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';

let ctx: TestContext;
let owner: { agent: Agent; userId: string; email: string };
let ml: FakeMl;
let ingest: IngestService;
let index: IndexService;
let event: { id: string; slug: string };
const photos: Record<string, string> = {};

// Селфи = e0. Зургуудын нүүр ба селфитэй cosine төсөө:
const SELFIE = vec({ 0: 1 });
const FACES = {
  mine: vec({ 0: 0.8, 2: 0.6 }), //       0.80 → Таны зургууд
  maybe: vec({ 0: 0.42, 1: 0.9075 }), //  0.42 → Магадгүй
  expanded: vec({ 0: 0.3, 2: 0.954 }), // 0.30 селфитэй, 0.81 "mine" нүүртэй → өргөтгөлөөр Магадгүй
  stranger: vec({ 3: 1 }), //             0    → гарахгүй
};

async function selfieJpeg() {
  return sharp({ create: { width: 600, height: 800, channels: 3, background: '#c9a' } }).jpeg().toBuffer();
}

/** Upload → ingest → (хуурамч ML-ийн нүүртэй) index */
async function indexedPhoto(name: string, capturedAt: string, faces: ReturnType<typeof fakeFace>[]) {
  const [r, g, b] = createHash('sha256').update(name + ctx.run).digest();
  const body = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: r!, g: g!, b: b! } } })
    .jpeg()
    .toBuffer();
  const batch = await owner.agent.post(`/photographer/events/${event.id}/upload-batches`).send({ totalFiles: 1 }).expect(201);
  const reg = await owner.agent
    .post(`/photographer/upload-batches/${batch.body.id}/files`)
    .send({ files: [{ name: `${name}.jpg`, size: body.length, type: 'image/jpeg', sha256: createHash('sha256').update(body).digest('hex') }] })
    .expect(200);
  const slot: RegisteredUpload = reg.body.files[0];
  if (slot.status !== 'upload') throw new Error('expected upload slot');
  await fetch(slot.url, { method: 'PUT', headers: slot.headers, body });
  await owner.agent.post(`/photographer/upload-batches/${batch.body.id}/complete`).send({ photoIds: [slot.photoId] }).expect(200);
  await ingest.process(slot.photoId);
  ml.width = 1200;
  ml.height = 800;
  ml.faces = faces;
  expect(await index.process(slot.photoId)).toBe('indexed');
  await ctx.prisma.photo.update({ where: { id: slot.photoId }, data: { capturedAt: new Date(capturedAt) } });
  photos[name] = slot.photoId;
}

async function search(agent: Agent, slug: string, status: number, opts: { consent?: boolean } = {}) {
  let req = agent.post(`/events/${slug}/search`).attach('selfie', await selfieJpeg(), { filename: 'me.jpg', contentType: 'image/jpeg' });
  if (opts.consent !== false) req = req.field('consent', 'true');
  return req.expect(status);
}

const ids = (list: { id: string }[]) => list.map((p) => p.id);

beforeAll(async () => {
  ml = await new FakeMl().listen();
  ctx = await createTestContext((b) => b.overrideProvider(MlClient).useValue(ml.client()));
  owner = await photographerAgent(ctx, 'searcher');
  const storage = ctx.app.get(StorageService);
  ingest = new IngestService(ctx.prisma, storage);
  index = new IndexService(ctx.prisma, storage, ml.client());

  const res = await owner.agent
    .post('/photographer/events')
    .send({
      title: `Search ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      pricePerPhoto: 10_000,
      visibility: 'PUBLIC',
    })
    .expect(201);
  event = res.body;

  await indexedPhoto('mine', '2026-06-14T01:00:00Z', [fakeFace(FACES.stranger, 90), fakeFace(FACES.mine, 70)]);
  await indexedPhoto('maybe', '2026-06-14T01:45:00Z', [fakeFace(FACES.maybe)]);
  await indexedPhoto('expanded', '2026-06-14T02:00:00Z', [fakeFace(FACES.expanded)]);
  await indexedPhoto('stranger', '2026-06-14T02:10:00Z', [fakeFace(FACES.stranger)]);
  await indexedPhoto('tiny', '2026-06-14T02:20:00Z', [fakeFace(SELFIE, 16)]); // 24px-ээс жижиг → хайлтад орохгүй
  await indexedPhoto('hidden', '2026-06-14T02:30:00Z', [fakeFace(SELFIE)]);
  await ctx.prisma.photo.update({ where: { id: photos['hidden'] }, data: { hiddenAt: new Date(), hiddenReason: 'test' } });
});

afterAll(async () => {
  await ctx?.close();
  ml?.close();
});

describe('selfie search', () => {
  let sessionId: string;

  it('requires explicit consent and a face', async () => {
    ml.faces = [fakeFace(SELFIE, 200)];
    const noConsent = await search(anonymous(ctx), event.slug, 400, { consent: false });
    expect(noConsent.body.code).toBe('consent_required');

    ml.faces = [];
    const noFace = await search(anonymous(ctx), event.slug, 422);
    expect(noFace.body.code).toBe('no_face_found');

    const noFile = await anonymous(ctx).post(`/events/${event.slug}/search`).field('consent', 'true').expect(400);
    expect(noFile.body.code).toBe('selfie_required');
  });

  it('splits results into mine and maybe, expands recall and excludes hidden/tiny faces', async () => {
    // Олон нүүртэй селфи: хамгийн том нь (e0) хайлтад орно
    ml.faces = [fakeFace(FACES.stranger, 60), fakeFace(SELFIE, 220)];
    ml.requests = [];
    const res = await search(anonymous(ctx), event.slug, 200);

    expect(ml.requests).toHaveLength(1);
    expect(ml.requests[0]!.headers.authorization).toBe('Bearer ml-token');
    expect(res.body).toMatchObject({ multipleFaces: true, modelVersion: FAKE_MODEL_VERSION });
    expect(ids(res.body.mine)).toEqual([photos['mine']]);
    // Магадгүй: шууд төсөө өндрөөс нь, дараа нь өргөтгөлөөр олдсон
    expect(ids(res.body.maybe)).toEqual([photos['maybe'], photos['expanded']]);
    expect(res.body.mine[0]).toMatchObject({ thumbUrl: expect.stringContaining('/thumb/'), previewUrl: expect.stringContaining('/preview/') });
    sessionId = res.body.sessionId;

    // Нууцлал: session-д зөвхөн embedding, хувилбар, тоо — IP/хэрэглэгчийн мэдээлэл байхгүй
    const [session] = await ctx.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT vector_dims(query_embedding) AS dims, consent_version, model_version, result_count
      FROM biometric.search_session WHERE id = ${sessionId}::uuid`;
    expect(session).toMatchObject({ dims: 128, model_version: FAKE_MODEL_VERSION, result_count: 3 });
    const columns = await ctx.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'biometric' AND table_name = 'search_session' ORDER BY column_name`;
    expect(columns.map((c) => c.column_name)).toEqual([
      'consent_version',
      'created_at',
      'event_id',
      'expires_at',
      'id',
      'model_version',
      'query_embedding',
      'result_count',
    ]);
  });

  it('keeps embeddings under 24 hours even when the TTL setting is 24h', async () => {
    const [row] = await ctx.prisma.$queryRaw<{ minutes: number }[]>`
      SELECT EXTRACT(EPOCH FROM expires_at - created_at)::int / 60 AS minutes
      FROM biometric.search_session WHERE id = ${sessionId}::uuid`;
    expect(row!.minutes).toBeLessThanOrEqual(24 * 60 - 5);
  });

  it('re-runs a stored search without the selfie', async () => {
    ml.requests = [];
    const again = await anonymous(ctx).get(`/events/${event.slug}/search/${sessionId}`).expect(200);
    expect(ids(again.body.mine)).toEqual([photos['mine']]);
    expect(ids(again.body.maybe)).toEqual([photos['maybe'], photos['expanded']]);
    expect(ml.requests).toHaveLength(0);

    await anonymous(ctx).get(`/events/other-event-${ctx.run}/search/${sessionId}`).expect(404);
  });

  it('lets the user delete their search data immediately', async () => {
    await anonymous(ctx).delete(`/search-sessions/${sessionId}`).expect(204);
    const [row] = await ctx.prisma.$queryRaw<{ has_embedding: boolean }[]>`
      SELECT query_embedding IS NOT NULL AS has_embedding FROM biometric.search_session WHERE id = ${sessionId}::uuid`;
    expect(row!.has_embedding).toBe(false);
    const gone = await anonymous(ctx).get(`/events/${event.slug}/search/${sessionId}`).expect(410);
    expect(gone.body.code).toBe('search_expired');
  });

  it('purges expired embeddings in the maintenance job', async () => {
    ml.faces = [fakeFace(SELFIE, 200)];
    const res = await search(anonymous(ctx), event.slug, 200);
    await ctx.prisma.$executeRaw`
      UPDATE biometric.search_session SET expires_at = now() - interval '1 second' WHERE id = ${res.body.sessionId}::uuid`;
    const { cleared } = await new SweeperService(ctx.prisma, ctx.app.get(StorageService)).purgeSearchSessions();
    expect(cleared).toBeGreaterThanOrEqual(1);
    const [row] = await ctx.prisma.$queryRaw<{ has_embedding: boolean }[]>`
      SELECT query_embedding IS NOT NULL AS has_embedding FROM biometric.search_session WHERE id = ${res.body.sessionId}::uuid`;
    expect(row!.has_embedding).toBe(false);
  });

  it('respects event visibility and the face search switch', async () => {
    ml.faces = [fakeFace(SELFIE, 200)];
    await owner.agent.patch(`/photographer/events/${event.id}`).send({ faceSearchEnabled: false }).expect(200);
    const disabled = await search(anonymous(ctx), event.slug, 409);
    expect(disabled.body.code).toBe('face_search_disabled');

    await owner.agent.patch(`/photographer/events/${event.id}`).send({ faceSearchEnabled: true, visibility: 'HIDDEN' }).expect(200);
    await search(anonymous(ctx), event.slug, 404);
    await owner.agent.patch(`/photographer/events/${event.id}`).send({ visibility: 'PUBLIC' }).expect(200);
  });

  it('rate limits selfie searches per IP', async () => {
    ml.faces = [fakeFace(SELFIE, 200)];
    await ctx.redis.del(...(await ctx.redis.keys('rl:search:selfie:*')));
    for (let i = 0; i < 10; i++) await search(anonymous(ctx), event.slug, 200);
    const limited = await search(anonymous(ctx), event.slug, 429);
    expect(limited.body.code).toBe('rate_limited');
    await ctx.redis.del(...(await ctx.redis.keys('rl:search:selfie:*')));
  });
});

describe('removal requests', () => {
  it('accepts a request for any existing photo without login', async () => {
    const res = await anonymous(ctx)
      .post(`/photos/${photos['stranger']}/removal-requests`)
      .send({ reason: 'ME_IN_PHOTO', message: 'Би энэ зурагт байна, устгана уу', contact: 'me@example.com' })
      .expect(201);
    expect(res.body.status).toBe('NEW');
    const stored = await ctx.prisma.removalRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored).toMatchObject({ photoId: photos['stranger'], reason: 'ME_IN_PHOTO: Би энэ зурагт байна, устгана уу', contact: 'me@example.com' });
  });

  it('validates input and unknown photos', async () => {
    await anonymous(ctx).post(`/photos/${photos['stranger']}/removal-requests`).send({ reason: 'SPAM' }).expect(400);
    const missing = await anonymous(ctx).post('/photos/00000000-0000-4000-8000-000000000000/removal-requests').send({ reason: 'OTHER' }).expect(404);
    expect(missing.body.code).toBe('photo_not_found');
  });
});
