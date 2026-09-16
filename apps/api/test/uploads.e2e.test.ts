import { createHash, randomBytes } from 'node:crypto';
import type { PhotoIngestJob, RegisteredUpload } from '@pic/shared';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHOTO_INGEST_QUEUE } from '../src/queue/queue.module';
import { type Agent, createTestContext, photographerAgent, type TestContext } from './helpers';

let ctx: TestContext;
let owner: { agent: Agent; userId: string; email: string };
let outsider: { agent: Agent; userId: string; email: string };
let eventId: string;
let queue: Queue<PhotoIngestJob>;

/** Тест бүрт давтагдашгүй "зураг" (storage JPEG эсэхийг шалгадаггүй; 2d-ийн worker шалгана) */
function fakePhoto(bytes = 2048) {
  const body = randomBytes(bytes);
  return { body, meta: { name: `IMG_${body.readUInt16BE(0)}.jpg`, size: bytes, type: 'image/jpeg', sha256: createHash('sha256').update(body).digest('hex') } };
}

async function put(upload: RegisteredUpload, body: Buffer) {
  if (upload.status !== 'upload') throw new Error('expected an upload slot');
  return fetch(upload.url, { method: 'PUT', headers: upload.headers, body });
}

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await photographerAgent(ctx, 'uploader');
  outsider = await photographerAgent(ctx, 'upload-outsider');
  queue = ctx.app.get(PHOTO_INGEST_QUEUE);
  const res = await owner.agent
    .post('/photographer/events')
    .send({ title: `Upload ${ctx.run}`, startsAt: '2026-06-14T07:00:00+08:00', endsAt: '2026-06-14T15:00:00+08:00', pricePerPhoto: 10_000 })
    .expect(201);
  eventId = res.body.id;
});

afterAll(async () => {
  await ctx?.close();
});

describe('bulk upload', () => {
  it('uploads directly to storage, verifies and enqueues ingest', async () => {
    const photos = [fakePhoto(), fakePhoto(3000)];
    const batch = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 2 }).expect(201);
    expect(batch.body.maxFileSizeBytes).toBe(50 * 1024 * 1024);

    const reg = await owner.agent
      .post(`/photographer/upload-batches/${batch.body.id}/files`)
      .send({ files: photos.map((p) => p.meta) })
      .expect(200);
    const files: RegisteredUpload[] = reg.body.files;
    expect(files.map((f) => f.status)).toEqual(['upload', 'upload']);

    for (const [i, f] of files.entries()) {
      const res = await put(f, photos[i]!.body);
      expect(res.status).toBe(200);
    }

    const done = await owner.agent
      .post(`/photographer/upload-batches/${batch.body.id}/complete`)
      .send({ photoIds: files.map((f) => f.photoId) })
      .expect(200);
    expect(done.body.results.map((r: { status: string }) => r.status)).toEqual(['uploaded', 'uploaded']);

    const stored = await ctx.prisma.photo.findUniqueOrThrow({ where: { id: files[0]!.photoId } });
    expect(stored).toMatchObject({ processingStatus: 'UPLOADED', bytes: 2048n, sha256: photos[0]!.meta.sha256, photographerId: owner.userId });
    // Storage түлхүүрт файлын нэр орохгүй
    expect(stored.storageKeys).toEqual({ original: `events/${eventId}/originals/${stored.id}.jpg` });

    const job = await queue.getJob(files[0]!.photoId);
    expect(job?.data).toEqual({ photoId: files[0]!.photoId });

    // Давтан complete: төлөв өөрчлөгдөхгүй, job давхардахгүй
    const again = await owner.agent
      .post(`/photographer/upload-batches/${batch.body.id}/complete`)
      .send({ photoIds: [files[0]!.photoId] })
      .expect(200);
    expect(again.body.results[0].status).toBe('uploaded');

    const stats = await owner.agent.get(`/photographer/events/${eventId}/photo-stats`).expect(200);
    expect(stats.body).toMatchObject({ total: 2, byStatus: { UPLOADED: 2, UPLOADING: 0 } });

    // Дахин сонгосон ижил файлууд + нэг хүсэлт доторх давхардал → бүгд duplicate
    const batch2 = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 3 }).expect(201);
    const reg2 = await owner.agent
      .post(`/photographer/upload-batches/${batch2.body.id}/files`)
      .send({ files: [photos[0]!.meta, photos[1]!.meta, photos[1]!.meta] })
      .expect(200);
    expect(reg2.body.files).toEqual([
      { index: 0, status: 'duplicate', photoId: files[0]!.photoId },
      { index: 1, status: 'duplicate', photoId: files[1]!.photoId },
      { index: 2, status: 'duplicate', photoId: files[1]!.photoId },
    ]);
  });

  it('resumes an interrupted upload in a new batch and reports missing objects', async () => {
    const photo = fakePhoto();
    const b1 = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(201);
    const r1 = await owner.agent.post(`/photographer/upload-batches/${b1.body.id}/files`).send({ files: [photo.meta] }).expect(200);
    const first: RegisteredUpload = r1.body.files[0];

    // PUT хийгээгүй (tab хаагдсан) → missing
    const missing = await owner.agent.post(`/photographer/upload-batches/${b1.body.id}/complete`).send({ photoIds: [first.photoId] }).expect(200);
    expect(missing.body.results[0].status).toBe('missing');

    // Маргааш дахин сонгоход ижил photoId-д шинэ URL олгоно
    const b2 = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(201);
    const r2 = await owner.agent.post(`/photographer/upload-batches/${b2.body.id}/files`).send({ files: [photo.meta] }).expect(200);
    const resumed: RegisteredUpload = r2.body.files[0];
    expect(resumed).toMatchObject({ status: 'upload', photoId: first.photoId });
    expect((await put(resumed, photo.body)).status).toBe(200);

    // Хуучин batch-аар дуусгах боломжгүй (шилжсэн), шинээр нь болно
    const old = await owner.agent.post(`/photographer/upload-batches/${b1.body.id}/complete`).send({ photoIds: [first.photoId] }).expect(200);
    expect(old.body.results[0].status).toBe('not_found');
    const ok = await owner.agent.post(`/photographer/upload-batches/${b2.body.id}/complete`).send({ photoIds: [first.photoId] }).expect(200);
    expect(ok.body.results[0].status).toBe('uploaded');
  });

  it('storage rejects a body that does not match the signed size', async () => {
    const photo = fakePhoto(4096);
    const batch = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(201);
    const reg = await owner.agent.post(`/photographer/upload-batches/${batch.body.id}/files`).send({ files: [photo.meta] }).expect(200);
    const res = await put(reg.body.files[0], randomBytes(5000));
    expect(res.status).toBe(403);
  });

  it('rejects files over the size limit', async () => {
    const batch = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(201);
    const res = await owner.agent
      .post(`/photographer/upload-batches/${batch.body.id}/files`)
      .send({ files: [{ ...fakePhoto().meta, size: 51 * 1024 * 1024 }] })
      .expect(400);
    expect(res.body.code).toBe('file_too_large');
  });

  it('keeps non-members out of events and batches', async () => {
    await outsider.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(404);
    await outsider.agent.get(`/photographer/events/${eventId}/photo-stats`).expect(404);

    const batch = await owner.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(201);
    await outsider.agent.post(`/photographer/upload-batches/${batch.body.id}/files`).send({ files: [fakePhoto().meta] }).expect(404);
    await outsider.agent
      .post(`/photographer/upload-batches/${batch.body.id}/complete`)
      .send({ photoIds: [batch.body.id] })
      .expect(404);
  });
});
