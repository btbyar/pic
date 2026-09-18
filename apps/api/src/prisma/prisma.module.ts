import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrismaClient, type PrismaClient } from '@pic/db';
import type { Env } from '../config/env';

export const PRISMA = Symbol('PRISMA');
/** Админ модулийн client: pic_admin_role — биометрийн өгөгдөлд хандах эрхгүй */
export const ADMIN_PRISMA = Symbol('ADMIN_PRISMA');

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createPrismaClient(config.get('APP_DATABASE_URL', { infer: true })),
    },
    {
      provide: ADMIN_PRISMA,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createPrismaClient(config.get('ADMIN_DATABASE_URL', { infer: true })),
    },
  ],
  exports: [PRISMA, ADMIN_PRISMA],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ADMIN_PRISMA) private readonly adminPrisma: PrismaClient,
  ) {}

  async onApplicationShutdown() {
    await Promise.all([this.prisma.$disconnect(), this.adminPrisma.$disconnect()]);
  }
}
