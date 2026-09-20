import exifReader from 'exifr';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { InvalidImageError, renderCover, renderDerivatives } from './derivatives';

async function jpeg(width: number, height: number, exif?: sharp.WriteableMetadata['exif'], orientation?: number) {
  let img = sharp({ create: { width, height, channels: 3, background: '#4a8' } }).jpeg();
  if (exif || orientation) img = img.withMetadata({ ...(exif ? { exif } : {}), ...(orientation ? { orientation } : {}) });
  return img.toBuffer();
}

describe('renderCover', () => {
  it('produces a 1600px WebP without a watermark', async () => {
    const original = await jpeg(3000, 2000);
    const cover = await renderCover(original);
    expect(cover).toMatchObject({ width: 1600, height: 1067 });
    expect((await sharp(cover.buffer).metadata()).format).toBe('webp');

    // Нэг өнгийн зураг: watermark байвал пикселүүд хоорондоо зөрнө (preview шиг)
    const flat = (await sharp(cover.buffer).stats()).channels.every((c) => c.stdev < 1);
    const preview = (await renderDerivatives(original)).preview;
    const previewFlat = (await sharp(preview.buffer).stats()).channels.every((c) => c.stdev < 1);
    expect(flat).toBe(true);
    expect(previewFlat).toBe(false);
  });

  it('does not upscale small images', async () => {
    expect(await renderCover(await jpeg(800, 600))).toMatchObject({ width: 800, height: 600 });
  });

  it('rejects a broken file', async () => {
    await expect(renderCover(Buffer.from('not an image'))).rejects.toBeInstanceOf(InvalidImageError);
  });
});

describe('renderDerivatives', () => {
  it('produces a 400px WebP thumb and a watermarked 1000px WebP preview', async () => {
    const out = await renderDerivatives(await jpeg(3000, 2000));
    expect(out).toMatchObject({ width: 3000, height: 2000 });
    expect(out.thumb).toMatchObject({ width: 400, height: 267 });
    expect(out.preview).toMatchObject({ width: 1000, height: 667 });
    expect((await sharp(out.thumb.buffer).metadata()).format).toBe('webp');
    expect((await sharp(out.preview.buffer).metadata()).format).toBe('webp');
  });

  it('does not upscale small images', async () => {
    const out = await renderDerivatives(await jpeg(300, 200));
    expect(out.thumb).toMatchObject({ width: 300, height: 200 });
    expect(out.preview).toMatchObject({ width: 300, height: 200 });
  });

  it('reads the EXIF capture time and strips all metadata including GPS', async () => {
    const original = await jpeg(1200, 800, {
      IFD0: { Make: 'Canon', Model: 'EOS R6' },
      IFD2: { DateTimeOriginal: '2026:06:14 09:30:15', OffsetTimeOriginal: '+08:00' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 55/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '106/1 55/1 0/1' },
    });
    // Тест өөрөө зөв: эх зурагт GPS байгаа
    expect((await exifReader.gps(original))?.latitude).toBeCloseTo(47.9167, 3);

    const out = await renderDerivatives(original);
    expect(out.exif).toEqual({ dateTimeOriginal: '2026:06:14 09:30:15', offsetTimeOriginal: '+08:00' });
    for (const buf of [out.thumb.buffer, out.preview.buffer]) {
      const meta = await sharp(buf).metadata();
      expect(meta.exif).toBeUndefined();
      expect(await exifReader.gps(buf).catch(() => undefined)).toBeFalsy();
    }
  });

  it('applies EXIF orientation (portrait shot stored landscape)', async () => {
    const out = await renderDerivatives(await jpeg(1600, 1200, undefined, 6));
    expect(out).toMatchObject({ width: 1200, height: 1600 });
    expect(out.thumb).toMatchObject({ width: 300, height: 400 });
  });

  it('watermark visibly changes the preview', async () => {
    const out = await renderDerivatives(await jpeg(1000, 1000));
    const stats = await sharp(out.preview.buffer).stats();
    // Нэг өнгөтэй зураг дээр watermark нь пикселийн хэлбэлзэл үүсгэнэ
    expect(stats.channels[0]!.stdev).toBeGreaterThan(5);
  });

  it('rejects files that are not supported images', async () => {
    await expect(renderDerivatives(Buffer.from('not an image'))).rejects.toBeInstanceOf(InvalidImageError);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    await expect(renderDerivatives(gif)).rejects.toMatchObject({ reason: 'unsupported_format' });
    const truncated = (await jpeg(2000, 2000)).subarray(0, 3000);
    await expect(renderDerivatives(truncated)).rejects.toMatchObject({ reason: 'unreadable_image' });
  });
});
