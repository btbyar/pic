'use client';

import {
  type CompletedUpload,
  type RegisteredUpload,
  UPLOAD_BATCH_MAX_FILES,
  UPLOAD_CONTENT_TYPES,
  type UploadContentType,
} from '@pic/shared';
import { api, type ApiError, type ApiResult } from './api-client';

export type UploadState = 'queued' | 'hashing' | 'uploading' | 'done' | 'duplicate' | 'failed' | 'rejected';

export type UploadProblem = 'unsupported_type' | 'too_large' | 'network' | 'storage' | 'verify' | 'server';

export interface UploadItem {
  file: File;
  state: UploadState;
  /** Илгээсэн байт (явцын мөрөнд) */
  sent: number;
  problem?: UploadProblem;
}

/** 50 файлаар нэг бүртгэл/дуусгалт — presigned URL хугацаа дуусахаас өмнө ашиглагдана */
const CHUNK = 50;
/** Storage руу зэрэг илгээх файл. 3G/утасны сүлжээнд 4-өөс их нь хурд нэмэхгүй. */
const PARALLEL_PUTS = 4;
const PARALLEL_HASHES = 3;
const ATTEMPTS = 3;

export { UPLOAD_BATCH_MAX_FILES };

interface Batch {
  id: string;
  maxFileSizeBytes: number;
}

/**
 * Файлуудыг байршуулна. `onChange` нь `items` массив дотор төлөв өөрчлөгдөх бүрт дуудагдана
 * (UI өөрөө render хийх давтамжаа хязгаарлана).
 */
export async function runUpload(
  eventId: string,
  items: UploadItem[],
  onChange: () => void,
  signal: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  for (const item of items) {
    if (!(UPLOAD_CONTENT_TYPES as readonly string[]).includes(item.file.type)) reject(item, 'unsupported_type');
  }
  const candidates = items.filter((i) => i.state !== 'rejected');
  onChange();
  if (candidates.length === 0) return { ok: true };

  const batchRes = await withRetry(() =>
    api<Batch>(`/photographer/events/${eventId}/upload-batches`, { method: 'POST', body: { totalFiles: candidates.length } }),
  );
  if (!batchRes.ok) return batchRes;
  const batch = batchRes.data;

  for (const item of candidates) {
    if (item.file.size > batch.maxFileSizeBytes) reject(item, 'too_large');
  }
  const accepted = candidates.filter((i) => i.state !== 'rejected');
  onChange();

  for (let start = 0; start < accepted.length; start += CHUNK) {
    if (signal.aborted) break;
    await uploadChunk(batch, accepted.slice(start, start + CHUNK), onChange, signal);
  }
  return { ok: true };
}

async function uploadChunk(batch: Batch, chunk: UploadItem[], onChange: () => void, signal: AbortSignal) {
  // 1. Hash
  const hashes = new Map<UploadItem, string>();
  await pool(chunk, PARALLEL_HASHES, async (item) => {
    if (signal.aborted) return;
    item.state = 'hashing';
    onChange();
    hashes.set(item, await sha256Hex(item.file));
  });
  const hashed = chunk.filter((i) => hashes.has(i));

  // 2. Бүртгэх
  const slots = await register(batch, hashed, hashes);
  if (!slots.ok) {
    hashed.forEach((i) => fail(i, slots.error.status === 0 ? 'network' : 'server'));
    onChange();
    return;
  }

  // 3. Storage руу шууд PUT
  const uploaded: { item: UploadItem; photoId: string }[] = [];
  await pool(hashed, PARALLEL_PUTS, async (item, idx) => {
    let slot = slots.data[idx]!;
    if (slot.status === 'duplicate') {
      item.state = 'duplicate';
      onChange();
      return;
    }
    item.state = 'uploading';
    onChange();
    for (let attempt = 1; attempt <= ATTEMPTS && !signal.aborted; attempt++) {
      const result = await putFile(slot, item, onChange, signal);
      if (result === 'ok') {
        uploaded.push({ item, photoId: slot.photoId });
        return;
      }
      if (attempt === ATTEMPTS) break;
      await sleep(1000 * 2 ** attempt);
      // URL хугацаа дууссан байж магадгүй — ижил файлд шинэ URL авна
      const fresh = await register(batch, [item], hashes);
      if (fresh.ok && fresh.data[0]) slot = fresh.data[0];
      if (slot.status === 'duplicate') {
        item.state = 'duplicate';
        onChange();
        return;
      }
    }
    fail(item, 'storage');
    onChange();
  });

  // 4. Баталгаажуулах
  if (uploaded.length === 0) return;
  const done = await withRetry(() =>
    api<{ results: CompletedUpload[] }>(`/photographer/upload-batches/${batch.id}/complete`, {
      method: 'POST',
      body: { photoIds: uploaded.map((u) => u.photoId) },
    }),
  );
  const statusById = new Map(done.ok ? done.data.results.map((r) => [r.photoId, r.status]) : []);
  for (const { item, photoId } of uploaded) {
    if (statusById.get(photoId) === 'uploaded') item.state = 'done';
    else fail(item, done.ok ? 'verify' : 'server');
  }
  onChange();
}

async function register(
  batch: Batch,
  items: UploadItem[],
  hashes: Map<UploadItem, string>,
): Promise<ApiResult<RegisteredUpload[]>> {
  if (items.length === 0) return { ok: true, data: [] };
  const res = await withRetry(() =>
    api<{ files: RegisteredUpload[] }>(`/photographer/upload-batches/${batch.id}/files`, {
      method: 'POST',
      body: {
        files: items.map((i) => ({
          name: i.file.name,
          size: i.file.size,
          type: i.file.type as UploadContentType,
          sha256: hashes.get(i)!,
        })),
      },
    }),
  );
  return res.ok ? { ok: true, data: res.data.files } : res;
}

/** fetch нь upload-ийн явцыг мэдээлдэггүй тул XHR */
function putFile(slot: RegisteredUpload & { status: 'upload' }, item: UploadItem, onChange: () => void, signal: AbortSignal) {
  return new Promise<'ok' | 'error'>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', slot.url);
    for (const [k, v] of Object.entries(slot.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      item.sent = e.loaded;
      onChange();
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? 'ok' : 'error');
    xhr.onerror = () => resolve('error');
    xhr.onabort = () => resolve('error');
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    item.sent = 0;
    xhr.send(item.file);
  });
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Сүлжээ тасрах, 5xx үед дахин оролдоно; 4xx нь шууд буцна */
async function withRetry<T>(fn: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  let res = await fn();
  for (let attempt = 1; attempt < ATTEMPTS && !res.ok && (res.error.status === 0 || res.error.status >= 500); attempt++) {
    await sleep(1000 * 2 ** attempt);
    res = await fn();
  }
  return res;
}

async function pool<T>(items: T[], size: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const idx = next++;
        await worker(items[idx]!, idx);
      }
    }),
  );
}

function reject(item: UploadItem, problem: UploadProblem) {
  item.state = 'rejected';
  item.problem = problem;
}

function fail(item: UploadItem, problem: UploadProblem) {
  item.state = 'failed';
  item.problem = problem;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
