import { Controller, Get, HttpStatus, Inject, type OnModuleDestroy, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { Redis } from 'ioredis';
import { Public } from '../auth/decorators';
import { REDIS } from '../redis/redis.module';
import type { Response } from 'express';
import type { PrismaClient } from '@pic/db';
import { PRISMA } from '../prisma/prisma.module';
import type { Env } from '../config/env';

type CheckResult = { ok: true } | { ok: false; error: string };

async function check(fn: () => Promise<unknown>): Promise<CheckResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

@Public()
@Controller('health')
export class HealthController implements OnModuleDestroy {
  private readonly s3: S3Client;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.s3 = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const [database, redis, storage, ml] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.redis.ping()),
      check(() =>
        this.s3.send(new HeadBucketCommand({ Bucket: this.config.get('S3_BUCKET_ORIGINALS', { infer: true }) })),
      ),
      check(async () => {
        const r = await fetch(`${this.config.get('ML_BASE_URL', { infer: true })}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!r.ok) throw new Error(`ML responded ${r.status}`);
      }),
    ]);

    // ML Phase 3 хүртэл заавал биш
    const healthy = database.ok && redis.ok && storage.ok;
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: healthy ? 'ok' : 'degraded', checks: { database, redis, storage, ml } };
  }

  onModuleDestroy() {
    this.s3.destroy();
  }
}
