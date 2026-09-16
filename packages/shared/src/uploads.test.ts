import { describe, expect, it } from 'vitest';
import { originalStorageKey, registerUploadFilesSchema, UPLOAD_CHUNK_MAX_FILES } from './uploads.js';

const file = (over: Record<string, unknown> = {}) => ({
  name: 'IMG_0001.JPG',
  size: 8_000_000,
  type: 'image/jpeg',
  sha256: 'a'.repeat(64),
  ...over,
});

describe('registerUploadFilesSchema', () => {
  it('accepts a normal chunk and strips directory paths from names', () => {
    const parsed = registerUploadFilesSchema.parse({
      files: [file({ name: 'C:\\Users\\bat\\Туул\\IMG_1.jpg' }), file({ name: 'a/b/c.png', type: 'image/png' })],
    });
    expect(parsed.files.map((f) => f.name)).toEqual(['IMG_1.jpg', 'c.png']);
  });

  it('rejects unsupported types, bad hashes and empty names', () => {
    expect(registerUploadFilesSchema.safeParse({ files: [file({ type: 'image/heic' })] }).success).toBe(false);
    expect(registerUploadFilesSchema.safeParse({ files: [file({ sha256: 'A'.repeat(64) })] }).success).toBe(false);
    expect(registerUploadFilesSchema.safeParse({ files: [file({ name: 'dir/' })] }).success).toBe(false);
    expect(registerUploadFilesSchema.safeParse({ files: [file({ size: 0 })] }).success).toBe(false);
  });

  it('limits the chunk size', () => {
    const files = Array.from({ length: UPLOAD_CHUNK_MAX_FILES + 1 }, () => file());
    expect(registerUploadFilesSchema.safeParse({ files }).success).toBe(false);
  });
});

describe('originalStorageKey', () => {
  it('never includes the client file name', () => {
    expect(originalStorageKey('e1', 'p1', 'image/jpeg')).toBe('events/e1/originals/p1.jpg');
    expect(originalStorageKey('e1', 'p1', 'image/webp')).toBe('events/e1/originals/p1.webp');
  });
});
