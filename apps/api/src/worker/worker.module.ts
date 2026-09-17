import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PhotoIngestJob, QUEUES } from '@pic/shared';
import { type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { AppConfigModule } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { IngestService, PermanentIngestError } from './ingest.service';
import { SweeperService } from './sweeper.service';

const SWEEP_EVERY_MS = 60 * 60 * 1000;

/** BullMQ worker-уудыг асааж, унтраана. API-гаас тусдаа процесс (`node dist/worker.js`). */
@Injectable()
class WorkerRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private workers: Worker[] = [];
  private maintenanceQueue: Queue | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly ingest: IngestService,
    private readonly sweeper: SweeperService,
  ) {}

  async onApplicationBootstrap() {
    const connection = { url: this.config.get('REDIS_URL', { infer: true }), maxRetriesPerRequest: null };
    const concurrency = this.config.get('WORKER_CONCURRENCY', { infer: true });
    const prefix = this.config.get('QUEUE_PREFIX', { infer: true });

    const ingestWorker = new Worker<PhotoIngestJob>(
      QUEUES.photoIngest,
      async (job) => {
        try {
          return await this.ingest.process(job.data.photoId);
        } catch (err) {
          // Эвдэрсэн файлыг 3 удаа дахин оролдох утгагүй
          if (err instanceof PermanentIngestError) throw new UnrecoverableError(err.reason);
          throw err;
        }
      },
      { connection, concurrency, prefix },
    );
    ingestWorker.on('failed', (job, err) => void this.onIngestFailed(job, err));
    ingestWorker.on('error', (err) => this.logger.error(err.message));

    this.maintenanceQueue = new Queue(QUEUES.maintenance, { connection, prefix });
    await this.maintenanceQueue.upsertJobScheduler('sweep-stale-uploads', { every: SWEEP_EVERY_MS }, { name: 'sweep-stale-uploads' });
    const maintenanceWorker = new Worker(
      QUEUES.maintenance,
      async (job) => {
        if (job.name === 'sweep-stale-uploads') return this.sweeper.sweepStaleUploads();
        throw new UnrecoverableError(`unknown maintenance job ${job.name}`);
      },
      { connection, concurrency: 1, prefix },
    );
    maintenanceWorker.on('error', (err) => this.logger.error(err.message));

    this.workers = [ingestWorker, maintenanceWorker];
    this.logger.log(`started (ingest concurrency ${concurrency})`);
  }

  private async onIngestFailed(job: Job<PhotoIngestJob> | undefined, err: Error) {
    if (!job) return;
    const exhausted = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
    if (exhausted) await this.ingest.markFailed(job.data.photoId, err.message);
    else this.logger.warn(`photo ${job.data.photoId} attempt ${job.attemptsMade} failed: ${err.message}`);
  }

  async onApplicationShutdown() {
    // Эхэлсэн job-уудыг дуусгаад зогсоно
    await Promise.all(this.workers.map((w) => w.close()));
    await this.maintenanceQueue?.close();
  }
}

@Module({
  imports: [AppConfigModule, PrismaModule, StorageModule],
  providers: [IngestService, SweeperService, WorkerRunner],
})
export class WorkerModule {}
