import {
  DeleteObjectCommand,
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
