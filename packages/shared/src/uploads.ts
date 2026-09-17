import { z } from 'zod';

// ---------------------------------------------------------------- хязгаар

/** Sharp-аар боловсруулж чадах, зурагчдын ашигладаг формат. RAW/HEIC-ийг зурагчин JPEG болгож оруулна. */
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

const EXTENSIONS: Record<UploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Нэг хүсэлтээр бүртгэх/дуусгах файлын дээд тоо (хүсэлтийн хэмжээ, DB транзакц богино байлгах) */
export const UPLOAD_CHUNK_MAX_FILES = 100;
/** Нэг batch-ийн дээд тоо — 5000 зураг нь томоохон марафоны нэг зурагчны өдөр */
export const UPLOAD_BATCH_MAX_FILES = 5000;

// ---------------------------------------------------------------- schema

export const createUploadBatchSchema = z.object({
  totalFiles: z.int().min(1).max(UPLOAD_BATCH_MAX_FILES),
});

export const uploadFileSchema = z.object({
  /** Зөвхөн файлын нэр — зам ("C:\\...\\IMG_1.jpg") ирвэл сүүлийн хэсгийг авна */
  name: z
    .string()
    .transform((v) => v.split(/[\\/]/).pop()!.trim())
    .pipe(z.string().min(1).max(255)),
  size: z.int().positive(),
  type: z.enum(UPLOAD_CONTENT_TYPES),
  /** Браузер тооцсон SHA-256 (hex). Давхардал илрүүлэхэд; worker бодит hash-ийг дахин шалгана. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const registerUploadFilesSchema = z.object({
  files: z.array(uploadFileSchema).min(1).max(UPLOAD_CHUNK_MAX_FILES),
});

export const completeUploadsSchema = z.object({
  photoIds: z.array(z.uuid()).min(1).max(UPLOAD_CHUNK_MAX_FILES),
});

export type UploadFileInput = z.output<typeof uploadFileSchema>;

// ---------------------------------------------------------------- storage

/** pic-originals доторх түлхүүр. Файлын нэр оруулахгүй (хувийн мэдээлэл, тусгай тэмдэгт). */
export function originalStorageKey(eventId: string, photoId: string, contentType: UploadContentType): string {
  return `events/${eventId}/originals/${photoId}.${EXTENSIONS[contentType]}`;
}

/** pic-public доторх watermark-тай preview ба жижиг thumb (галерей). URL нь таамаглахад хэцүү photoId-гаас хамаарна. */
export function derivativeStorageKey(eventId: string, photoId: string, kind: 'thumb' | 'preview'): string {
  return `events/${eventId}/${kind}/${photoId}.webp`;
}

export interface PhotoStorageKeys {
  original: string;
  thumb?: string;
  preview?: string;
}

// ---------------------------------------------------------------- queue

export const QUEUES = {
  /** Phase 2d: EXIF, thumb/preview, watermark */
  photoIngest: 'photo-ingest',
  /** Phase 3: нүүр илрүүлж embedding хадгалах (ML сервис) */
  photoIndex: 'photo-index',
  /** Давтагддаг цэвэрлэгээ (тасалдсан upload г.м.) */
  maintenance: 'maintenance',
} as const;

export interface PhotoIngestJob {
  photoId: string;
}

export interface PhotoIndexJob {
  photoId: string;
}

// ---------------------------------------------------------------- хариу

/**
 * - `upload`: presigned URL руу PUT хийнэ (шинэ эсвэл өмнө тасалдсан файл)
 * - `duplicate`: энэ эвэнтэд аль хэдийн байгаа — алгасна
 */
export type RegisteredUpload =
  | { index: number; status: 'upload'; photoId: string; url: string; headers: Record<string, string> }
  | { index: number; status: 'duplicate'; photoId: string };

export type CompletedUpload = {
  photoId: string;
  status: 'uploaded' | 'missing' | 'size_mismatch' | 'not_found';
};
