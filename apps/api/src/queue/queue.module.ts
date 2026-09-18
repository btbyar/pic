import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EmailJob, type PhotoIndexJob, type PhotoIngestJob, QUEUES } from '@pic/shared';
import { Queue } from 'bullmq';
import type { Env } from '../config/env';

export const PHOTO_INGEST_QUEUE = Symbol('PHOTO_INGEST_QUEUE');
export type PhotoIngestQueue = Queue<PhotoIngestJob>;

export const PHOTO_INDEX_QUEUE = Symbol('PHOTO_INDEX_QUEUE');
export type PhotoIndexQueue = Queue<PhotoIndexJob>;

export const EMAIL_QUEUE = Symbol('EMAIL_QUEUE');
export type EmailQueue = Queue<EmailJob>;

const connection = (config: ConfigService<Env, true>) => ({
  connection: { url: config.get('REDIS_URL', { infer: true }) },
  prefix: config.get('QUEUE_PREFIX', { infer: true }),
});

@Global()
@Module({
  providers: [
    {
      provide: PHOTO_INGEST_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PhotoIngestQueue =>
        new Queue<PhotoIngestJob>(QUEUES.photoIngest, {
          ...connection(config),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
            // Амжилттай job-ыг удаан хадгалах шаардлагагүй; амжилтгүйг админ "дахин ажиллуулах"-д харна
            removeOnComplete: { age: 24 * 3600, count: 10_000 },
            removeOnFail: { age: 14 * 24 * 3600 },
          },
        }),
    },
    {
      provide: PHOTO_INDEX_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PhotoIndexQueue =>
        new Queue<PhotoIndexJob>(QUEUES.photoIndex, {
          ...connection(config),
          defaultJobOptions: {
            // ML сервис дахин асах хүртэл хүлээх зай (30с, 1м, 2м, 4м, 8м)
            attempts: 5,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { age: 24 * 3600, count: 10_000 },
            removeOnFail: { age: 14 * 24 * 3600 },
          },
        }),
    },
    {
      provide: EMAIL_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailQueue =>
        new Queue<EmailJob>(QUEUES.email, {
          ...connection(config),
          defaultJobOptions: {
            // SMTP түр унтарсан үед ~1 цаг хүртэл дахин оролдоно
            attempts: 8,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: true,
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        }),
    },
  ],
  exports: [PHOTO_INGEST_QUEUE, PHOTO_INDEX_QUEUE, EMAIL_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(
    @Inject(PHOTO_INGEST_QUEUE) private readonly ingest: PhotoIngestQueue,
    @Inject(PHOTO_INDEX_QUEUE) private readonly index: PhotoIndexQueue,
    @Inject(EMAIL_QUEUE) private readonly email: EmailQueue,
  ) {}

  async onApplicationShutdown() {
    await Promise.all([this.ingest.close(), this.index.close(), this.email.close()]);
  }
}
