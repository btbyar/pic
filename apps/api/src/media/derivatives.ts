import * as exifr from 'exifr';
import sharp from 'sharp';
import { watermarkSvg } from './watermark';

// Олон job зэрэг ажиллахад libvips-ийн кэш санах ойг хэрэггүй дүүргэнэ
sharp.cache(false);

export const THUMB_MAX_PX = 400;
export const PREVIEW_MAX_PX = 1000;
/** Эвэнтийн нүүрний зураг (hero, баннер) — өргөн дэлгэцэд хүрэлцэхүйц */
export const COVER_MAX_PX = 1600;
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/** Дахин оролдоод засагдахгүй алдаа (эвдэрсэн файл, дэмжигдээгүй формат) */
export class InvalidImageError extends Error {
  constructor(readonly reason: 'unreadable_image' | 'unsupported_format') {
    super(reason);
    this.name = 'InvalidImageError';
  }
}

export interface RenderedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface Derivatives {
  /** Эргүүлэлт (EXIF Orientation) хэрэглэсний дараах эх зургийн хэмжээ */
  width: number;
  height: number;
  exif: { dateTimeOriginal?: string; offsetTimeOriginal?: string };
  thumb: RenderedImage;
  preview: RenderedImage;
}

/**
 * Эх зургаас галерейн thumb ба watermark-тай preview үүсгэнэ.
 * sharp нь default-аар бүх metadata-г (EXIF, GPS байршил, камерын серийн дугаар) хасна —
 * `withMetadata()` хэзээ ч бүү дууд.
 */
export async function renderDerivatives(original: Buffer): Promise<Derivatives> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(original).metadata();
  } catch {
    throw new InvalidImageError('unreadable_image');
  }
  if (!meta.format || !SUPPORTED_FORMATS.has(meta.format)) throw new InvalidImageError('unsupported_format');
  if (!meta.width || !meta.height) throw new InvalidImageError('unreadable_image');

  // Orientation 5–8: 90°-аар эргэсэн тул өргөн/өндөр солигдоно
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;

  const exif = await readExifTime(original);

  try {
    const base = sharp(original, { failOn: 'truncated' }).rotate();
    const [thumb, previewRaw] = await Promise.all([
      base
        .clone()
        .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72, effort: 4 })
        .toBuffer({ resolveWithObject: true }),
      // Watermark-ийн хэмжээг яг тааруулахын тулд эхлээд raw пиксел болгоно
      base
        .clone()
        .resize(PREVIEW_MAX_PX, PREVIEW_MAX_PX, { fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);

    const { width: pw, height: ph, channels } = previewRaw.info;
    const preview = await sharp(previewRaw.data, { raw: { width: pw, height: ph, channels } })
      .composite([{ input: watermarkSvg(pw, ph) }])
      .webp({ quality: 75, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      width,
      height,
      exif,
      thumb: { buffer: thumb.data, width: thumb.info.width, height: thumb.info.height },
      preview: { buffer: preview.data, width: preview.info.width, height: preview.info.height },
    };
  } catch (err) {
    // libvips-ийн decode алдаа (тасарсан JPEG г.м.)
    if (err instanceof Error && /VipsJpeg|VipsPng|VipsWebp|premature end|corrupt|truncated|bad seek/i.test(err.message)) {
      throw new InvalidImageError('unreadable_image');
    }
    throw err;
  }
}

/**
 * Эвэнтийн cover зураг: watermark-гүй, том хэмжээтэй. Зөвхөн зурагчны сонгосон нэг зурагт үүсгэнэ —
 * нүүр хуудас, профайлын баннер дээр бичигтэй зураг муухай харагддаг.
 */
export async function renderCover(original: Buffer): Promise<RenderedImage> {
  try {
    const out = await sharp(original, { failOn: 'truncated' })
      .rotate()
      .resize(COVER_MAX_PX, COVER_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new InvalidImageError('unreadable_image');
  }
}

async function readExifTime(original: Buffer): Promise<Derivatives['exif']> {
  try {
    // reviveValues: false — огноог Date болгохгүй (серверийн цагийн бүсээр буруу тайлбарлана), түүхий текстээр авна
    const tags: Record<string, unknown> | undefined = await exifr.parse(original, {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'CreateDate', 'OffsetTimeDigitized'],
      reviveValues: false,
    });
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const dateTimeOriginal = str(tags?.['DateTimeOriginal']) ?? str(tags?.['CreateDate']);
    const offsetTimeOriginal = str(tags?.['OffsetTimeOriginal']) ?? str(tags?.['OffsetTimeDigitized']);
    return {
      ...(dateTimeOriginal ? { dateTimeOriginal } : {}),
      ...(offsetTimeOriginal ? { offsetTimeOriginal } : {}),
    };
  } catch {
    // EXIF эвдэрсэн байсан ч зургийг боловсруулна — цаггүй үлдэнэ
    return {};
  }
}
