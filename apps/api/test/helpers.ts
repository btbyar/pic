import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@pic/db';
import type { Role, UserStatus } from '@pic/shared';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { PRISMA } from '../src/prisma/prisma.module';
import { REDIS } from '../src/redis/redis.module';

export const WEB_ORIGIN = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
const PASSWORD = 'e2e-test-password-1';

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaClient;
  redis: Redis;
  run: string;
  close(): Promise<void>;
}

/** `override` — provider-ийг орлуулах (жишээ нь ML client-ийг хуурамч сервер рүү) */
export async function createTestContext(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<TestContext> {
  const moduleRef = await override(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  const prisma = app.get<PrismaClient>(PRISMA);
  const redis = app.get<Redis>(REDIS);
  await clearRateLimits(redis);
  return {
    app,
    prisma,
    redis,
    run: randomUUID().slice(0, 8),
    async close() {
      await clearRateLimits(redis);
      await app.close();
    },
  };
}

async function clearRateLimits(redis: Redis) {
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);
}

export type Agent = ReturnType<typeof request.agent>;

/** Хэрэглэгчийг DB-д шууд үүсгээд нэвтэрсэн agent буцаана (2FA шаардахгүй зурагчин). */
export async function photographerAgent(
  ctx: TestContext,
  label: string,
  status: UserStatus = 'APPROVED',
): Promise<{ agent: Agent; userId: string; email: string }> {
  const email = `e2e-${label}-${ctx.run}@pic.local`;
  const user = await createUser(ctx, email, 'PHOTOGRAPHER', status);
  const agent = request.agent(ctx.app.getHttpServer()).set('Origin', WEB_ORIGIN);
  await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  return { agent, userId: user.id, email };
}

export function anonymous(ctx: TestContext): Agent {
  return request.agent(ctx.app.getHttpServer()).set('Origin', WEB_ORIGIN);
}

async function createUser(ctx: TestContext, email: string, role: Role, status: UserStatus) {
  return ctx.prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      role,
      status,
      displayName: `E2E ${email.split('@')[0]}`,
      ...(role === 'PHOTOGRAPHER' ? { photographerProfile: { create: {} } } : {}),
    },
  });
}
