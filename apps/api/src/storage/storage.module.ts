import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export type BucketName = 'originals' | 'public';

/** RFC 6266: ASCII fallback + UTF-8 (кирилл файлын нэр) */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * S3-тэй нийцтэй хадгалалт (dev: MinIO, prod: Cloudflare R2).
 * Хоёр client: `internal` нь API/worker-ээс хандах хаяг, `presigner` нь браузерт өгөх URL-ийн хаяг
 * (docker дотор "minio:9000" браузерт хүрэхгүй). Signature нь host-оос хамаардаг тул тусдаа байх ёстой.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly internal: S3Client;
  private readonly presigner: S3Client;
  private readonly buckets: Record<BucketName, string>;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    const common = {
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
      // SDK default-аар хоосон body-ийн CRC32 checksum-ийг presigned URL-д оруулдаг → браузерын PUT амжилтгүй болно
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.internal = new S3Client({ ...common, endpoint: config.get('S3_ENDPOINT', { infer: true }) });
    this.presigner = new S3Client({ ...common, endpoint: config.get('S3_PUBLIC_ENDPOINT', { infer: true }) });
    this.buckets = {
      originals: config.get('S3_BUCKET_ORIGINALS', { infer: true }),
      public: config.get('S3_BUCKET_PUBLIC', { infer: true }),
    };
    this.publicBaseUrl = config.get('PUBLIC_MEDIA_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  /**
   * Браузерын шууд PUT-д зориулсан URL. Content-Type болон Content-Length гарын үсэгт орно —
   * өөр хэмжээтэй/төрөлтэй файл илгээвэл storage өөрөө татгалзана.
   */
  async presignPut(
    bucket: BucketName,
    key: string,
    opts: { contentType: string; contentLength: number; expiresInSec: number },
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const url = await getSignedUrl(
      this.presigner,
      new PutObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        ContentType: opts.contentType,
        ContentLength: opts.contentLength,
      }),
      { expiresIn: opts.expiresInSec, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    // Content-Length-ийг браузер өөрөө тавина (forbidden header)
    return { url, headers: { 'Content-Type': opts.contentType } };
  }

  /** Худалдан авсан эх зургийг татах богино хугацааны URL. Браузер файлыг хадгална (attachment). */
  async presignGet(bucket: BucketName, key: string, opts: { expiresInSec: number; filename: string }): Promise<string> {
    return getSignedUrl(
      this.presigner,
      new GetObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        ResponseContentDisposition: contentDisposition(opts.filename),
      }),
      { expiresIn: opts.expiresInSec },
    );
  }

  /** Объект байхгүй бол null */
  async head(bucket: BucketName, key: string): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const res = await this.internal.send(new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404)) {
        return null;
      }
      throw err;
    }
  }

  async get(bucket: BucketName, key: string): Promise<Buffer> {
    const res = await this.internal.send(new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }));
    if (!res.Body) throw new Error(`empty body for ${bucket}/${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async put(bucket: BucketName, key: string, body: Buffer, opts: { contentType: string; cacheControl?: string }): Promise<void> {
    await this.internal.send(
      new PutObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        Body: body,
        ContentType: opts.contentType,
        CacheControl: opts.cacheControl,
      }),
    );
  }

  /** pic-public объектын браузерт харагдах URL (dev: MinIO, prod: R2 custom domain/CDN) */
  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async delete(bucket: BucketName, key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }));
  }

  async ping(): Promise<void> {
    await this.internal.send(new HeadBucketCommand({ Bucket: this.buckets.originals }));
  }

  onModuleDestroy() {
    this.internal.destroy();
    this.presigner.destroy();
  }
}

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
