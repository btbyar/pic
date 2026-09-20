import { createHash, randomBytes } from 'node:crypto';
import type { PhotoStorageKeys, RegisteredUpload } from '@pic/shared';
import exifReader from 'exifr';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageService } from '../src/storage/storage.module';
import { IngestService, PermanentIngestError } from '../src/worker/ingest.service';
import { SweeperService } from '../src/worker/sweeper.service';
import { type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';

let ctx: TestContext;
let owner: { agent: Agent; userId: string; email: string };
let storage: StorageService;
let ingest: IngestService;
let sweeper: SweeperService;
let event: { id: string; slug: string };

async function exifJpeg(dateTimeOriginal: string, seed: number) {
  return sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: seed % 255, g: 120, b: 80 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Canon' },
      IFD2: { DateTimeOriginal: dateTimeOriginal },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 55/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '106/1 55/1 0/1' },
    })
    .toBuffer();
}

/** Upload API-аар (register → PUT → complete) оруулаад photoId буцаана. `claimedSha` нь худал hash илгээх тест. */
async function upload(body: Buffer, claimedSha?: string): Promise<string> {
  const sha256 = claimedSha ?? createHash('sha256').update(body).digest('hex');
  const batch = await owner.agent.post(`/photographer/events/${event.id}/upload-batches`).send({ totalFiles: 1 }).expect(201);
  const reg = await owner.agent
    .post(`/photographer/upload-batches/${batch.body.id}/files`)
    .send({ files: [{ name: 'IMG.jpg', size: body.length, type: 'image/jpeg', sha256 }] })
    .expect(200);
  const slot: RegisteredUpload = reg.body.files[0];
  if (slot.status !== 'upload') throw new Error('expected upload slot');
  expect((await fetch(slot.url, { method: 'PUT', headers: slot.headers, body })).status).toBe(200);
  const done = await owner.agent.post(`/photographer/upload-batches/${batch.body.id}/complete`).send({ photoIds: [slot.photoId] }).expect(200);
  expect(done.body.results[0].status).toBe('uploaded');
  return slot.photoId;
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await photographerAgent(ctx, 'ingest');
  storage = ctx.app.get(StorageService);
  ingest = new IngestService(ctx.prisma, storage);
  sweeper = new SweeperService(ctx.prisma, storage);
  const res = await owner.agent
    .post('/photographer/events')
    .send({
      title: `Ingest ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      pricePerPhoto: 10_000,
      visibility: 'PUBLIC',
    })
    .expect(201);
  event = res.body;
  // Камер 2 минут хоцорсон
  await owner.agent.put(`/photographer/events/${event.id}/clock-offset`).send({ clockOffsetSec: 120 }).expect(200);
});

afterAll(async () => {
  await ctx?.close();
});

describe('photo ingest', () => {
  let photoId: string;

  it('derives thumb/preview, corrects capture time and sets the cover', async () => {
    photoId = await upload(await exifJpeg('2026:06:14 09:30:15', 1));
    await anonymous(ctx).get(`/events/${event.slug}/photos`).expect(200, { items: [], nextCursor: null });

    expect(await ingest.process(photoId)).toBe('derived');
    expect(await ingest.process(photoId)).toBe('skipped');

    const photo = await ctx.prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo).toMatchObject({ processingStatus: 'DERIVED', width: 2400, height: 1600, failureReason: null });
    // Улаанбаатарын 09:30:15 = 01:30:15Z, + камерын 2 минутын засвар
    expect(photo.capturedAtRaw?.toISOString()).toBe('2026-06-14T01:30:15.000Z');
    expect(photo.capturedAt?.toISOString()).toBe('2026-06-14T01:32:15.000Z');

    const keys = photo.storageKeys as unknown as PhotoStorageKeys;
    expect(keys.thumb).toBe(`events/${event.id}/thumb/${photoId}.webp`);

    // Нийтийн URL-ээр нэвтрэлтгүй татагдана, GPS/EXIF хасагдсан
    for (const key of [keys.thumb!, keys.preview!]) {
      const res = await fetch(storage.publicUrl(key));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/webp');
      expect(res.headers.get('cache-control')).toContain('immutable');
      const buf = Buffer.from(await res.arrayBuffer());
      expect((await sharp(buf).metadata()).exif).toBeUndefined();
      expect(await exifReader.gps(buf).catch(() => undefined)).toBeFalsy();
    }
    const preview = await sharp(Buffer.from(await (await fetch(storage.publicUrl(keys.preview!))).arrayBuffer())).metadata();
    expect([preview.width, preview.height]).toEqual([1000, 667]);

    const page = await anonymous(ctx).get(`/events/${event.slug}`).expect(200);
    // Cover-ийн том зураг нь watermark-гүй тусдаа хувилбар (preview биш)
    expect(page.body).toMatchObject({ photoCount: 1, coverUrl: storage.publicUrl(keys.thumb!), coverLargeUrl: storage.publicUrl(keys.cover!) });
    expect(keys.cover).toContain(`/cover/${photoId}.webp`);
    const gallery = await anonymous(ctx).get(`/events/${event.slug}/photos`).expect(200);
    expect(gallery.body.items).toEqual([
      {
        id: photoId,
        width: 2400,
        height: 1600,
        capturedAt: '2026-06-14T01:32:15.000Z',
        thumbUrl: storage.publicUrl(keys.thumb!),
        previewUrl: storage.publicUrl(keys.preview!),
      },
    ]);
  });

  it('recomputes capture times when the photographer changes the clock offset', async () => {
    await owner.agent.put(`/photographer/events/${event.id}/clock-offset`).send({ clockOffsetSec: -60 }).expect(200);
    const photo = await ctx.prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo.capturedAt?.toISOString()).toBe('2026-06-14T01:29:15.000Z');
    expect(photo.capturedAtRaw?.toISOString()).toBe('2026-06-14T01:30:15.000Z');
  });

  it('orders the gallery by capture time and pages with a cursor', async () => {
    const earlier = await upload(await exifJpeg('2026:06:14 08:00:00', 2));
    const noExif = await upload(await sharp({ create: { width: 800, height: 600, channels: 3, background: '#123' } }).jpeg().toBuffer());
    await ingest.process(earlier);
    await ingest.process(noExif);
    const gallery = await anonymous(ctx).get(`/events/${event.slug}/photos`).expect(200);
    // Цаггүй зураг төгсгөлд
    expect(gallery.body.items.map((p: { id: string }) => p.id)).toEqual([earlier, photoId, noExif]);
    expect(gallery.body.items[2].capturedAt).toBeNull();
    await anonymous(ctx).get(`/events/${event.slug}/photos`).query({ cursor: 'nope' }).expect(400);
  });

  it('fails permanently on corrupt files and on a lying hash', async () => {
    const corrupt = await upload(randomBytes(5000));
    await expect(ingest.process(corrupt)).rejects.toMatchObject({ reason: 'unreadable_image' });
    await ingest.markFailed(corrupt, 'unreadable_image');
    expect(await ctx.prisma.photo.findUniqueOrThrow({ where: { id: corrupt } })).toMatchObject({
      processingStatus: 'FAILED',
      failureReason: 'unreadable_image',
    });

    const real = await exifJpeg('2026:06:14 10:00:00', 3);
    const lying = await upload(real, 'b'.repeat(64));
    await expect(ingest.process(lying)).rejects.toBeInstanceOf(PermanentIngestError);
    await expect(ingest.process(lying)).rejects.toMatchObject({ reason: 'sha256_mismatch' });

    // Амжилтгүй зураг галерейд, тоонд орохгүй
    const page = await anonymous(ctx).get(`/events/${event.slug}`).expect(200);
    expect(page.body.photoCount).toBe(3);
  });

  it('keeps hidden events’ galleries private', async () => {
    await owner.agent.patch(`/photographer/events/${event.id}`).send({ visibility: 'HIDDEN' }).expect(200);
    await anonymous(ctx).get(`/events/${event.slug}/photos`).expect(404);
    await owner.agent.get(`/events/${event.slug}/photos`).expect(200);
    const mine = await owner.agent.get(`/photographer/events/${event.id}`).expect(200);
    expect(mine.body.coverUrl).toContain(`/thumb/${photoId}.webp`);
  });
});

describe('stale upload sweeper', () => {
  it('removes uploads abandoned for more than 24 hours, and only those', async () => {
    const staleKey = `events/${event.id}/originals/stale-${ctx.run}.jpg`;
    await storage.put('originals', staleKey, Buffer.from('partial'), { contentType: 'image/jpeg' });
    const common = { eventId: event.id, photographerId: owner.userId, originalFilename: 'x.jpg', bytes: 7n };
    const stale = await ctx.prisma.photo.create({
      data: { ...common, storageKeys: { original: staleKey }, sha256: randomBytes(32).toString('hex'), createdAt: new Date(Date.now() - 25 * 3600_000) },
    });
    const fresh = await ctx.prisma.photo.create({
      data: { ...common, storageKeys: { original: `${staleKey}.fresh` }, sha256: randomBytes(32).toString('hex') },
    });

    expect(await sweeper.sweepStaleUploads()).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.photo.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await storage.head('originals', staleKey)).toBeNull();
    expect(await ctx.prisma.photo.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    // Боловсруулсан зураг хуучин ч хамаагүй үлдэнэ
    expect(await ctx.prisma.photo.count({ where: { eventId: event.id, processingStatus: 'DERIVED' } })).toBe(3);
  });
});
