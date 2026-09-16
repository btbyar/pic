import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@pic/db';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { Public } from '../auth/decorators';
import type { Env } from '../config/env';
import { PRISMA } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { StorageService } from '../storage/storage.module';

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
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const [database, redis, storage, ml] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.redis.ping()),
      check(() => this.storage.ping()),
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
}
