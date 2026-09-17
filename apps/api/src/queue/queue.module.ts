import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PhotoIngestJob, QUEUES } from '@pic/shared';
import { Queue } from 'bullmq';
import type { Env } from '../config/env';

export const PHOTO_INGEST_QUEUE = Symbol('PHOTO_INGEST_QUEUE');
export type PhotoIngestQueue = Queue<PhotoIngestJob>;

@Global()
@Module({
  providers: [
    {
      provide: PHOTO_INGEST_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PhotoIngestQueue =>
        new Queue<PhotoIngestJob>(QUEUES.photoIngest, {
          connection: { url: config.get('REDIS_URL', { infer: true }) },
          prefix: config.get('QUEUE_PREFIX', { infer: true }),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
            // Амжилттай job-ыг удаан хадгалах шаардлагагүй; амжилтгүйг админ "дахин ажиллуулах"-д харна
            removeOnComplete: { age: 24 * 3600, count: 10_000 },
            removeOnFail: { age: 14 * 24 * 3600 },
          },
        }),
    },
  ],
  exports: [PHOTO_INGEST_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(PHOTO_INGEST_QUEUE) private readonly ingest: PhotoIngestQueue) {}

  async onApplicationShutdown() {
    await this.ingest.close();
  }
}
