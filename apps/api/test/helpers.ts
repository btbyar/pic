import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@pic/db';
import type { Role, UserStatus } from '@pic/shared';
import type { Redis } from 'ioredis';
import { generateSync } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { newTotpSecret } from '../src/auth/totp';
import { FieldCipher } from '../src/common/crypto';
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

export interface AdminAgent {
  agent: Agent;
  userId: string;
  /** Эргэлт буцалтгүй үйлдэлд дахин асуух TOTP код (replay хамгаалалтыг тестэд тойрно) */
  stepUpCode(): Promise<string>;
}

/** 2FA идэвхтэй админ үүсгэж, нууц үг + TOTP-оор нэвтэрнэ */
export async function adminAgent(ctx: TestContext, label: string): Promise<AdminAgent> {
  const secret = newTotpSecret();
  const cipher = new FieldCipher(ctx.app.get(ConfigService).get<string>('FIELD_ENCRYPTION_KEY')!);
  const email = `e2e-admin-${label}-${ctx.run}@pic.local`;
  const user = await ctx.prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: 'ADMIN',
      status: 'APPROVED',
      displayName: `E2E admin ${label}`,
      totpSecretEnc: cipher.encrypt(secret),
      totpEnabledAt: new Date(),
    },
  });
  const code = () => generateSync({ secret, epoch: Math.floor(Date.now() / 1000), period: 30 });
  const agent = request.agent(ctx.app.getHttpServer()).set('Origin', WEB_ORIGIN);
  await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  await agent.post('/auth/mfa/verify').send({ code: code() }).expect(200);
  return {
    agent,
    userId: user.id,
    async stepUpCode() {
      await ctx.prisma.user.update({ where: { id: user.id }, data: { totpLastStep: null } });
      return code();
    },
  };
}
