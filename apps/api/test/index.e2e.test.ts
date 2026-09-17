import { createHash } from 'node:crypto';
import type { RegisteredUpload } from '@pic/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageService } from '../src/storage/storage.module';
import type { MlFace } from '../src/ml/ml-client';
import { IndexService } from '../src/worker/index.service';
import { IngestService, PermanentIngestError } from '../src/worker/ingest.service';
import { FakeMl } from './fake-ml';
import { type Agent, createTestContext, photographerAgent, type TestContext } from './helpers';

let ctx: TestContext;
let owner: { agent: Agent; userId: string; email: string };
let ingest: IngestService;
let index: IndexService;
let ml: FakeMl;

const unit = (axis: number): number[] => Array.from({ length: 128 }, (_, i) => (i === axis ? 1 : 0));
const face = (axis: number, bbox: [number, number, number, number]): MlFace => ({
  bbox,
  landmarks: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  detScore: 0.93,
  sizePx: Math.min(bbox[2], bbox[3]),
  quality: 0.8,
  embedding: unit(axis),
});

async function createEvent(faceSearchEnabled: boolean) {
  const res = await owner.agent
    .post('/photographer/events')
    .send({
      title: `Index ${faceSearchEnabled} ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      pricePerPhoto: 10_000,
      faceSearchEnabled,
    })
    .expect(201);
  return res.body.id as string;
}

/** Upload → ingest хүртэл явуулж DERIVED зураг бэлдэнэ */
async function derivedPhoto(eventId: string, width: number, height: number): Promise<string> {
  const body = await sharp({ create: { width, height, channels: 3, background: { r: width % 255, g: 90, b: 40 } } })
    .jpeg()
    .toBuffer();
  const batch = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(201);
  const reg = await owner.agent
    .post(`/photographer/upload-batches/${batch.body.id}/files`)
    .send({ files: [{ name: 'a.jpg', size: body.length, type: 'image/jpeg', sha256: createHash('sha256').update(body).digest('hex') }] })
    .expect(200);
  const slot: RegisteredUpload = reg.body.files[0];
  if (slot.status !== 'upload') throw new Error('expected upload slot');
  await fetch(slot.url, { method: 'PUT', headers: slot.headers, body });
  await owner.agent.post(`/photographer/upload-batches/${batch.body.id}/complete`).send({ photoIds: [slot.photoId] }).expect(200);
  expect(await ingest.process(slot.photoId)).toBe('derived');
  return slot.photoId;
}

async function storedFaces(photoId: string) {
  return ctx.prisma.$queryRaw<{ dims: number; bbox: { x: number; y: number; w: number; h: number }; face_size_px: number; model_version: string; axis0: number }[]>`
    SELECT vector_dims(embedding) AS dims, bbox, face_size_px, model_version, (embedding::real[])[1] AS axis0
    FROM biometric.face_embedding WHERE photo_id = ${photoId}::uuid ORDER BY face_size_px DESC`;
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await photographerAgent(ctx, 'indexer');
  ml = await new FakeMl().listen();
  const storage = ctx.app.get(StorageService);
  ingest = new IngestService(ctx.prisma, storage);
  index = new IndexService(ctx.prisma, storage, ml.client());
});

afterAll(async () => {
  ml?.close();
  await ctx?.close();
});

describe('face indexing', () => {
  it('stores 128-dim embeddings in original-image coordinates and marks the photo INDEXED', async () => {
    const eventId = await createEvent(true);
    // 4000px зургийг ML-д 2560px болгож илгээнэ → координатыг 1.5625 дахин томруулна
    const photoId = await derivedPhoto(eventId, 4000, 2000);
    ml.width = 2560;
    ml.height = 1280;
    ml.faces = [face(0, [100, 200, 80, 96]), face(1, [1000, 300, 40, 48])];
    ml.requests = [];

    expect(await index.process(photoId)).toBe('indexed');

    expect(ml.requests).toHaveLength(1);
    expect(ml.requests[0]!.headers.authorization).toBe('Bearer ml-token');
    expect(ml.requests[0]!.headers['content-type']).toMatch(/^multipart\/form-data/);
    // Илгээсэн зураг нь багасгасан JPEG (multipart body-оос файлын хэсгийг салгаж шалгана)
    const body = ml.requests[0]!.body;
    const jpeg = body.subarray(body.indexOf(Buffer.from([0xff, 0xd8, 0xff])), body.lastIndexOf(Buffer.from('\r\n--')));
    const sent = await sharp(jpeg).metadata();
    expect([sent.format, sent.width, sent.height]).toEqual(['jpeg', 2560, 1280]);

    const photo = await ctx.prisma.photo.findUniqueOrThrow({ where: { id: photoId } });
    expect(photo).toMatchObject({ processingStatus: 'INDEXED', faceCount: 2, failureReason: null });

    const rows = await storedFaces(photoId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ dims: 128, face_size_px: 80, model_version: 'fake-sface', axis0: 1 });
    expect(rows[0]!.bbox).toEqual({ x: 156.3, y: 312.5, w: 125, h: 150 });

    // INDEXED зураг галерейд харагдсаар
    const event = await ctx.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    await owner.agent.get(`/events/${event.slug}/photos`).expect(200).expect((r) => expect(r.body.items).toHaveLength(1));

    // Дахин индексжүүлэхэд давхардахгүй (орлуулна)
    await ctx.prisma.photo.update({ where: { id: photoId }, data: { processingStatus: 'DERIVED' } });
    ml.faces = [face(2, [10, 10, 60, 60])];
    await index.process(photoId);
    expect(await storedFaces(photoId)).toHaveLength(1);
    expect(await index.process(photoId)).toBe('skipped');
  });

  it('creates no biometric data when face search is disabled for the event', async () => {
    const eventId = await createEvent(false);
    const photoId = await derivedPhoto(eventId, 800, 600);
    ml.requests = [];
    expect(await index.process(photoId)).toBe('indexed');
    expect(ml.requests).toHaveLength(0);
    expect(await ctx.prisma.photo.findUniqueOrThrow({ where: { id: photoId } })).toMatchObject({
      processingStatus: 'INDEXED',
      faceCount: 0,
    });
    expect(await storedFaces(photoId)).toHaveLength(0);
  });

  it('retries on ML outages but gives up on unreadable images, keeping the photo in the gallery', async () => {
    const eventId = await createEvent(true);
    const photoId = await derivedPhoto(eventId, 800, 600);

    ml.status = 503;
    await expect(index.process(photoId)).rejects.not.toBeInstanceOf(PermanentIngestError);
    ml.status = 422;
    await expect(index.process(photoId)).rejects.toBeInstanceOf(PermanentIngestError);
    ml.status = 200;

    await index.markFailed(photoId, 'ml_422');
    expect(await ctx.prisma.photo.findUniqueOrThrow({ where: { id: photoId } })).toMatchObject({
      processingStatus: 'DERIVED',
      failureReason: 'index: ml_422',
    });
  });
});
