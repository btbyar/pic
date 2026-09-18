import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EmailJob, type PhotoIndexJob, type PhotoIngestJob, QUEUES } from '@pic/shared';
import { type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { AppConfigModule } from '../config/config.module';
import type { Env } from '../config/env';
import { MailModule } from '../mail/mailer';
import { MlModule } from '../ml/ml-client';
import { OrderPaymentsService } from '../payments/order-payments.service';
import { PaymentsModule } from '../payments/payments.module';
import { PhotosModule } from '../photos/photo-purge.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PHOTO_INDEX_QUEUE, type PhotoIndexQueue, QueueModule } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { EmailService } from './email.service';
import { IndexService } from './index.service';
import { IngestService, PermanentIngestError } from './ingest.service';
import { RetentionService } from './retention.service';
import { SweeperService } from './sweeper.service';

const SWEEP_EVERY_MS = 60 * 60 * 1000;
/** search.service нь 24ц-аас энэ хугацааг хасаж expires_at тавьдаг — нийтдээ ≤24 цаг */
export const SEARCH_PURGE_EVERY_MS = 5 * 60 * 1000;
const EXPIRE_ORDERS_EVERY_MS = 5 * 60 * 1000;
const RETENTION_EVERY_MS = 60 * 60 * 1000;

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
    private readonly email: EmailService,
    private readonly orderPayments: OrderPaymentsService,
    private readonly retention: RetentionService,
    @Inject(PHOTO_INDEX_QUEUE) private readonly indexQueue: PhotoIndexQueue,
  ) {}

  async onApplicationBootstrap() {
    const connection = { url: this.config.get('REDIS_URL', { infer: true }), maxRetriesPerRequest: null };
    const concurrency = this.config.get('WORKER_CONCURRENCY', { infer: true });
    const prefix = this.config.get('QUEUE_PREFIX', { infer: true });

    const indexQueue = this.indexQueue;

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
    await maintenanceQueue.upsertJobScheduler('purge-search-sessions', { every: SEARCH_PURGE_EVERY_MS }, { name: 'purge-search-sessions' });
    await maintenanceQueue.upsertJobScheduler('expire-orders', { every: EXPIRE_ORDERS_EVERY_MS }, { name: 'expire-orders' });
    await maintenanceQueue.upsertJobScheduler('retention', { every: RETENTION_EVERY_MS }, { name: 'retention' });
    const maintenanceWorker = new Worker(
      QUEUES.maintenance,
      async (job) => {
        if (job.name === 'sweep-stale-uploads') return this.sweeper.sweepStaleUploads();
        if (job.name === 'purge-search-sessions') return this.sweeper.purgeSearchSessions();
        if (job.name === 'expire-orders') return this.orderPayments.expireDue();
        if (job.name === 'retention') return this.retention.run();
        throw new UnrecoverableError(`unknown maintenance job ${job.name}`);
      },
      { connection, concurrency: 1, prefix },
    );

    const emailWorker = new Worker<EmailJob>(QUEUES.email, (job) => this.email.process(job.data), {
      connection,
      concurrency: 4,
      prefix,
    });
    emailWorker.on('failed', (job, err) => this.logger.warn(`email ${job?.name} attempt ${job?.attemptsMade} failed: ${err.message}`));

    this.workers = [ingestWorker, indexWorker, maintenanceWorker, emailWorker];
    this.queues = [maintenanceQueue];
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
  imports: [AppConfigModule, PrismaModule, RedisModule, StorageModule, QueueModule, MlModule, MailModule, PaymentsModule, PhotosModule],
  providers: [IngestService, IndexService, SweeperService, EmailService, RetentionService, WorkerRunner],
})
export class WorkerModule {}
