import { createHash } from 'node:crypto';
import type { RegisteredUpload } from '@pic/shared';
import sharp from 'sharp';
import type { MlFace } from '../src/ml/ml-client';
import type { IndexService } from '../src/worker/index.service';
import type { IngestService } from '../src/worker/ingest.service';
import type { FakeMl } from './fake-ml';
import type { Agent, TestContext } from './helpers';

export interface PhotoPipeline {
  ctx: TestContext;
  agent: Agent;
  ingest: IngestService;
  index: IndexService;
  ml: FakeMl;
}

/** Upload → ingest → (хуурамч ML-ийн нүүртэй) index. Эх файлын bytes-ийг буцаана (татсан файлтай харьцуулах). */
export async function uploadIndexedPhoto(p: PhotoPipeline, eventId: string, name: string, faces: MlFace[]) {
  const [r, g, b] = createHash('sha256').update(name + p.ctx.run).digest();
  const body = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: r!, g: g!, b: b! } } })
    .jpeg()
    .toBuffer();
  const batch = await p.agent.post(`/photographer/events/${eventId}/upload-batches`).send({ totalFiles: 1 }).expect(201);
  const reg = await p.agent
    .post(`/photographer/upload-batches/${batch.body.id}/files`)
    .send({ files: [{ name: `${name}.jpg`, size: body.length, type: 'image/jpeg', sha256: createHash('sha256').update(body).digest('hex') }] })
    .expect(200);
  const slot: RegisteredUpload = reg.body.files[0];
  if (slot.status !== 'upload') throw new Error('expected upload slot');
  await fetch(slot.url, { method: 'PUT', headers: slot.headers, body });
  await p.agent.post(`/photographer/upload-batches/${batch.body.id}/complete`).send({ photoIds: [slot.photoId] }).expect(200);
  await p.ingest.process(slot.photoId);
  p.ml.width = 1200;
  p.ml.height = 800;
  p.ml.faces = faces;
  await p.index.process(slot.photoId);
  return { id: slot.photoId, bytes: body };
}
