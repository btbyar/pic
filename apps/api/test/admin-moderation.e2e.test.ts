import type { PrismaClient } from '@pic/db';
import type { PhotoStorageKeys } from '@pic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MlClient } from '../src/ml/ml-client';
import { PhotoPurgeService } from '../src/photos/photo-purge.service';
import { ADMIN_PRISMA } from '../src/prisma/prisma.module';
import { PHOTO_INDEX_QUEUE, type PhotoIndexQueue } from '../src/queue/queue.module';
import { StorageService } from '../src/storage/storage.module';
import { IndexService } from '../src/worker/index.service';
import { IngestService } from '../src/worker/ingest.service';
import { RetentionService } from '../src/worker/retention.service';
import { FakeMl, fakeFace, vec } from './fake-ml';
import {
  type AdminAgent,
  adminAgent,
  type Agent,
  anonymous,
  createTestContext,
  photographerAgent,
  type TestContext,
} from './helpers';
import { type PhotoPipeline, uploadIndexedPhoto } from './photos';

let ctx: TestContext;
let ml: FakeMl;
let admin: AdminAgent;
let owner: { agent: Agent; userId: string };
let pipeline: PhotoPipeline;
let storage: StorageService;
let event: { id: string; slug: string };

const faceCount = async (photoId: string) => {
  const [row] = await ctx.prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "biometric"."face_embedding" WHERE photo_id = ${photoId}::uuid`;
  return row!.n;
};

async function photo(name: string) {
  return uploadIndexedPhoto(pipeline, event.id, name, [fakeFace(vec({ 0: 1 }))]);
}

async function removalRequest(photoId: string) {
  const res = await anonymous(ctx)
    .post(`/photos/${photoId}/removal-requests`)
    .send({ reason: 'ME_IN_PHOTO', message: 'Энэ би байна, устгана уу', contact: 'me@example.mn' })
    .expect(201);
  return res.body.id as string;
}

beforeAll(async () => {
  ml = await new FakeMl().listen();
  ctx = await createTestContext((b) => b.overrideProvider(MlClient).useValue(ml.client()));
  admin = await adminAgent(ctx, 'moderator');
  owner = await photographerAgent(ctx, 'moderated');
  storage = ctx.app.get(StorageService);
  pipeline = {
    ctx,
    agent: owner.agent,
    ml,
    ingest: new IngestService(ctx.prisma, storage),
    index: new IndexService(ctx.prisma, storage, ml.client()),
  };
  const res = await owner.agent
    .post('/photographer/events')
    .send({
      title: `Moderation ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      visibility: 'PUBLIC',
      pricePerPhoto: 5_000,
    })
    .expect(201);
  event = res.body;
});

afterAll(async () => {
  await ctx?.close();
  ml?.close();
});

describe('admin database role', () => {
  it('cannot read biometric data even with raw SQL', async () => {
    const adminDb = ctx.app.get<PrismaClient>(ADMIN_PRISMA);
    await expect(adminDb.$queryRaw`SELECT count(*) FROM "biometric"."face_embedding"`).rejects.toThrow(/permission denied/i);
    await expect(adminDb.$queryRaw`SELECT count(*) FROM "biometric"."search_session"`).rejects.toThrow(/permission denied/i);
    expect(await adminDb.photo.count()).toBeGreaterThanOrEqual(0);
  });
});

describe('overview', () => {
  it('is admin-only and counts work that needs attention', async () => {
    await owner.agent.get('/admin/overview').expect(403);
    await anonymous(ctx).get('/admin/overview').expect(401);
    const res = await admin.agent.get('/admin/overview').expect(200);
    expect(res.body).toMatchObject({
      pendingPhotographers: expect.any(Number),
      newRemovals: expect.any(Number),
      month: { orders: expect.any(Number), revenue: expect.any(Number) },
      expiringEvents: expect.any(Array),
    });
  });
});

describe('removal requests', () => {
  it('hides a photo: gone from gallery and search index, reversible', async () => {
    const p = await photo('hide-me');
    expect(await faceCount(p.id)).toBe(1);
    const id = await removalRequest(p.id);

    const list = await admin.agent.get('/admin/removal-requests?status=NEW').expect(200);
    const item = list.body.items.find((r: { id: string }) => r.id === id);
    expect(item).toMatchObject({
      reason: 'ME_IN_PHOTO: Энэ би байна, устгана уу',
      contact: 'me@example.mn',
      photo: { id: p.id, hidden: false, previewUrl: expect.stringContaining('/preview/') },
    });

    const res = await admin.agent.post(`/admin/removal-requests/${id}/resolve`).send({ action: 'hide', note: 'зөвшөөрөв' }).expect(200);
    expect(res.body).toMatchObject({ status: 'RESOLVED', resolution: 'hide: зөвшөөрөв' });
    expect(await faceCount(p.id)).toBe(0);
    const gallery = await anonymous(ctx).get(`/events/${event.slug}/photos`).expect(200);
    expect(gallery.body.items.map((i: { id: string }) => i.id)).not.toContain(p.id);

    // Дахин шийдвэрлэх боломжгүй
    await admin.agent.post(`/admin/removal-requests/${id}/resolve`).send({ action: 'reject' }).expect(409);

    // Нуултыг буцаахад нүүрийг дахин индексжүүлэх job queue-д орно
    await admin.agent.post(`/admin/photos/${p.id}/unhide`).expect(200);
    const jobs = await ctx.app.get<PhotoIndexQueue>(PHOTO_INDEX_QUEUE).getJobs(['waiting', 'delayed']);
    const job = jobs.find((j) => j.data.photoId === p.id);
    expect(job).toBeDefined();
    expect(await pipeline.index.process(p.id)).toBe('indexed');
    expect(await faceCount(p.id)).toBe(1);
    await job!.remove();

    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: { in: [id, p.id] } }, orderBy: { id: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(['photo.hide', 'removal.hide', 'photo.unhide']);
    expect(audit.every((a) => a.actorId === admin.userId)).toBe(true);
  });

  it('deletes a photo for good only with a fresh TOTP code, keeping sales history', async () => {
    const p = await photo('delete-me');
    const keys = (await ctx.prisma.photo.findUniqueOrThrow({ where: { id: p.id } })).storageKeys as unknown as PhotoStorageKeys;
    // Худалдан авалттай зураг: санхүүгийн бүртгэл үлдэх ёстой
    const order = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [p.id] }).expect(201);
    const id = await removalRequest(p.id);

    const noCode = await admin.agent.post(`/admin/removal-requests/${id}/resolve`).send({ action: 'delete' }).expect(401);
    expect(noCode.body.code).toBe('invalid_mfa_code');
    expect(await ctx.prisma.photo.count({ where: { id: p.id } })).toBe(1);

    await admin.agent
      .post(`/admin/removal-requests/${id}/resolve`)
      .send({ action: 'delete', totpCode: await admin.stepUpCode() })
      .expect(200);

    expect(await ctx.prisma.photo.count({ where: { id: p.id } })).toBe(0);
    expect(await faceCount(p.id)).toBe(0);
    expect(await storage.head('originals', keys.original)).toBeNull();
    expect(await storage.head('public', keys.thumb!)).toBeNull();
    expect(await storage.head('public', keys.preview!)).toBeNull();

    const item = await ctx.prisma.orderItem.findFirstOrThrow({ where: { orderId: order.body.id } });
    expect(item).toMatchObject({ photoId: null, photoFilenameSnap: 'delete-me.jpg', price: 5_000 });
    const request = await ctx.prisma.removalRequest.findUniqueOrThrow({ where: { id } });
    expect(request).toMatchObject({ status: 'RESOLVED', photoId: null, handledById: admin.userId });
  });

  it('rejects a request without touching the photo', async () => {
    const p = await photo('keep-me');
    const id = await removalRequest(p.id);
    await admin.agent.post(`/admin/removal-requests/${id}/resolve`).send({ action: 'reject', note: 'өөр хүн байна' }).expect(200);
    const stored = await ctx.prisma.photo.findUniqueOrThrow({ where: { id: p.id } });
    expect(stored.hiddenAt).toBeNull();
    expect(await faceCount(p.id)).toBe(1);
  });

  it('is closed to photographers', async () => {
    await owner.agent.get('/admin/removal-requests').expect(403);
  });
});

describe('retention', () => {
  it('purges photos, files and faces of expired events and old soft-deleted photos, keeping the event and orders', async () => {
    const expired = await photo('expired');
    const expiredKeys = (await ctx.prisma.photo.findUniqueOrThrow({ where: { id: expired.id } })).storageKeys as unknown as PhotoStorageKeys;
    const order = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [expired.id] }).expect(201);

    // Өөр эвэнт: soft-delete хийгээд 31 хоног болсон зураг + 29 хоног болсон зураг
    const other = await owner.agent
      .post('/photographer/events')
      .send({
        title: `Retention ${ctx.run}`,
        startsAt: '2026-06-14T07:00:00+08:00',
        endsAt: '2026-06-14T15:00:00+08:00',
        pricePerPhoto: 5_000,
      })
      .expect(201);
    const old = await uploadIndexedPhoto(pipeline, other.body.id, 'old-deleted', [fakeFace(vec({ 1: 1 }))]);
    const recent = await uploadIndexedPhoto(pipeline, other.body.id, 'recent-deleted', [fakeFace(vec({ 2: 1 }))]);
    const day = 24 * 3600_000;
    await ctx.prisma.photo.update({ where: { id: old.id }, data: { deletedAt: new Date(Date.now() - 31 * day) } });
    await ctx.prisma.photo.update({ where: { id: recent.id }, data: { deletedAt: new Date(Date.now() - 29 * day) } });

    await ctx.prisma.event.update({ where: { id: event.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const result = await new RetentionService(ctx.prisma, ctx.app.get(PhotoPurgeService)).run();
    expect(result.expiredPhotos).toBeGreaterThanOrEqual(1);
    expect(result.deletedPhotos).toBeGreaterThanOrEqual(1);

    expect(await ctx.prisma.photo.count({ where: { eventId: event.id } })).toBe(0);
    expect(await faceCount(expired.id)).toBe(0);
    expect(await storage.head('originals', expiredKeys.original)).toBeNull();
    expect(await ctx.prisma.photo.count({ where: { id: old.id } })).toBe(0);
    expect(await ctx.prisma.photo.count({ where: { id: recent.id } })).toBe(1);

    // Эвэнт ба санхүүгийн бүртгэл үлдэнэ
    expect(await ctx.prisma.event.count({ where: { id: event.id } })).toBe(1);
    expect(await ctx.prisma.order.count({ where: { id: order.body.id } })).toBe(1);
    // Дахин ажиллуулахад хийх зүйлгүй
    const again = await new RetentionService(ctx.prisma, ctx.app.get(PhotoPurgeService)).run();
    expect(await ctx.prisma.photo.count({ where: { eventId: event.id } })).toBe(0);
    expect(again.deletedPhotos).toBe(0);
  });
});
