import { Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PhotoIndexJob, type PhotoIngestJob, QUEUES } from '@pic/shared';
import { type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { AppConfigModule } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { IndexService } from './index.service';
import { IngestService, PermanentIngestError } from './ingest.service';
import { SweeperService } from './sweeper.service';

const SWEEP_EVERY_MS = 60 * 60 * 1000;

/** BullMQ worker-уудыг асааж, унтраана. API-гаас тусдаа процесс (`node dist/worker.js`). */
@Injectable()
class WorkerRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private workers: Worker[] = [];
  private queues: Queue[] = [];

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly ingest: IngestService,
    private readonly index: IndexService,
    private readonly sweeper: SweeperService,
  ) {}

  async onApplicationBootstrap() {
    const connection = { url: this.config.get('REDIS_URL', { infer: true }), maxRetriesPerRequest: null };
    const concurrency = this.config.get('WORKER_CONCURRENCY', { infer: true });
    const prefix = this.config.get('QUEUE_PREFIX', { infer: true });

    const indexQueue = new Queue<PhotoIndexJob>(QUEUES.photoIndex, {
      connection,
      prefix,
      defaultJobOptions: {
        // ML сервис дахин асах хүртэл хүлээх зай (30с, 1м, 2м, 4м, 8м)
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 10_000 },
        removeOnFail: { age: 14 * 24 * 3600 },
      },
    });

    const ingestWorker = new Worker<PhotoIngestJob>(
      QUEUES.photoIngest,
      async (job) => {
        try {
          const outcome = await this.ingest.process(job.data.photoId);
          // Галерейд харагдсаны дараа нүүр индексжүүлэлт тусдаа job — ML унасан ч derive дахин хийгдэхгүй
          if (outcome === 'derived') {
            await indexQueue.add('index', { photoId: job.data.photoId }, { jobId: job.data.photoId });
          }
          return outcome;
        } catch (err) {
          // Эвдэрсэн файлыг 3 удаа дахин оролдох утгагүй
          if (err instanceof PermanentIngestError) throw new UnrecoverableError(err.reason);
          throw err;
        }
      },
      { connection, concurrency, prefix },
    );
    ingestWorker.on('failed', (job, err) =>
      void this.onFailed(job, err, (id, reason) => this.ingest.markFailed(id, reason)),
    );

    const indexWorker = new Worker<PhotoIndexJob>(
      QUEUES.photoIndex,
      async (job) => {
        try {
          return await this.index.process(job.data.photoId);
        } catch (err) {
          if (err instanceof PermanentIngestError) throw new UnrecoverableError(err.reason);
          throw err;
        }
      },
      { connection, concurrency, prefix },
    );
    indexWorker.on('failed', (job, err) =>
      void this.onFailed(job, err, (id, reason) => this.index.markFailed(id, reason)),
    );

    const maintenanceQueue = new Queue(QUEUES.maintenance, { connection, prefix });
    await maintenanceQueue.upsertJobScheduler('sweep-stale-uploads', { every: SWEEP_EVERY_MS }, { name: 'sweep-stale-uploads' });
    const maintenanceWorker = new Worker(
      QUEUES.maintenance,
      async (job) => {
        if (job.name === 'sweep-stale-uploads') return this.sweeper.sweepStaleUploads();
        throw new UnrecoverableError(`unknown maintenance job ${job.name}`);
      },
      { connection, concurrency: 1, prefix },
    );

    this.workers = [ingestWorker, indexWorker, maintenanceWorker];
    this.queues = [indexQueue, maintenanceQueue];
    for (const w of this.workers) w.on('error', (err) => this.logger.error(err.message));
    this.logger.log(`started (concurrency ${concurrency})`);
  }

  private async onFailed(
    job: Job<{ photoId: string }> | undefined,
    err: Error,
    markFailed: (photoId: string, reason: string) => Promise<void>,
  ) {
    if (!job) return;
    const exhausted = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
    if (exhausted) await markFailed(job.data.photoId, err.message);
    else this.logger.warn(`${job.queueName} ${job.data.photoId} attempt ${job.attemptsMade} failed: ${err.message}`);
  }

  async onApplicationShutdown() {
    // Эхэлсэн job-уудыг дуусгаад зогсоно
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(this.queues.map((q) => q.close()));
  }
}

@Module({
  imports: [AppConfigModule, PrismaModule, StorageModule],
  providers: [IngestService, IndexService, SweeperService, WorkerRunner],
})
export class WorkerModule {}
