'use client';

/** 3G-д хурдан илгээхийн тулд селфиг ≤800px JPEG болгоно (~60–120KB). Царай танихад хангалттай. */
const MAX_SIDE = 800;
const QUALITY = 0.85;

/** Файл (утасны камер/галерей) → жижигрүүлсэн JPEG. EXIF эргүүлэлтийг хэрэглэнэ. */
export async function shrinkImageFile(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return await drawToJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Камерын video-ийн одоогийн кадр → JPEG. Урд камерын толин тусгалыг буцааж зөв чиглэлд хадгална. */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return drawToJpeg(video, video.videoWidth, video.videoHeight);
}

async function drawToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not supported');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('could not encode image');
  return blob;
}
