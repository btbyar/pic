import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@pic/db';
import type { Redis } from 'ioredis';
import { generateSync } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { PRISMA } from '../src/prisma/prisma.module';
import { REDIS } from '../src/redis/redis.module';

const WEB = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
const run = randomUUID().slice(0, 8);
const adminEmail = `e2e-admin-${run}@pic.local`;
const adminPassword = 'e2e-admin-password-1';
const photographerEmail = `e2e-photo-${run}@pic.local`;
const photographerPassword = 'e2e-photo-password-1';

let app: NestExpressApplication;
let prisma: PrismaClient;
let redis: Redis;

const totpNow = (secret: string) => generateSync({ secret, epoch: Math.floor(Date.now() / 1000), period: 30 });

async function clearRateLimits() {
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  prisma = app.get(PRISMA);
  redis = app.get(REDIS);
  await clearRateLimits();

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      role: 'ADMIN',
      status: 'APPROVED',
      displayName: 'E2E admin',
    },
  });
});

afterAll(async () => {
  // audit_log нь өөрчлөгдөхгүй тул тестийн хэрэглэгчдийг устгахгүй — зөвхөн session-уудыг цэвэрлэнэ
  await prisma?.authSession.deleteMany({ where: { user: { email: { in: [adminEmail, photographerEmail] } } } });
  await clearRateLimits();
  await app?.close();
});

describe('auth flow', () => {
  const photographer = () => request.agent(app.getHttpServer()).set('Origin', WEB);
  let photographerAgent: ReturnType<typeof photographer>;
  let adminAgent: ReturnType<typeof photographer>;
  let photographerId: string;

  it('keeps routes closed by default and health public', async () => {
    const server = app.getHttpServer();
    await request(server).get('/auth/me').expect(401);
    await request(server).get('/admin/photographers').expect(401);
    const health = await request(server).get('/health');
    expect([200, 503]).toContain(health.status);
  });

  it('registers a photographer as PENDING with an httpOnly session cookie', async () => {
    photographerAgent = photographer();
    const res = await photographerAgent
      .post('/auth/register')
      .send({ email: photographerEmail.toUpperCase(), password: photographerPassword, displayName: 'E2E зурагчин' })
      .expect(201);
    expect(res.body).toEqual({ mfa: 'none' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/pic_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toContain('pic_session');

    const me = await photographerAgent.get('/auth/me').expect(200);
    expect(me.body).toMatchObject({ email: photographerEmail, role: 'PHOTOGRAPHER', status: 'PENDING' });
    photographerId = me.body.id;

    await photographer()
      .post('/auth/register')
      .send({ email: photographerEmail, password: photographerPassword, displayName: 'Дахин' })
      .expect(409);
  });

  it('rejects state-changing requests from a foreign origin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: adminEmail, password: adminPassword })
      .expect(403);
    expect(res.body.code).toBe('origin_not_allowed');
  });

  it('forces admins through TOTP setup before admin routes', async () => {
    adminAgent = request.agent(app.getHttpServer()).set('Origin', WEB);
    const login = await adminAgent.post('/auth/login').send({ email: adminEmail, password: adminPassword }).expect(200);
    expect(login.body).toEqual({ mfa: 'setup_required' });

    const blocked = await adminAgent.get('/admin/photographers').expect(403);
    expect(blocked.body.code).toBe('mfa_required');

    const setup = await adminAgent.post('/auth/mfa/setup').expect(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    await adminAgent.post('/auth/mfa/enable').send({ code: '000000' }).expect(401);

    const enabled = await adminAgent.post('/auth/mfa/enable').send({ code: totpNow(setup.body.secret) }).expect(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    expect(stored.totpSecretEnc).toMatch(/^v1\./);
    expect(stored.totpSecretEnc).not.toContain(setup.body.secret);
    expect(stored.recoveryCodeHashes).not.toContain(enabled.body.recoveryCodes[0]);

    // Шинэ нэвтрэлт: код шаардана; recovery code нэг л удаа ажиллана
    const second = request.agent(app.getHttpServer()).set('Origin', WEB);
    expect((await second.post('/auth/login').send({ email: adminEmail, password: adminPassword })).body).toEqual({
      mfa: 'required',
    });
    await second.get('/admin/photographers').expect(403);
    const recovery = enabled.body.recoveryCodes[0].toLowerCase().replace('-', '');
    const verified = await second.post('/auth/mfa/verify').send({ recoveryCode: recovery }).expect(200);
    expect(verified.body.recoveryCodesLeft).toBe(9);
    await second.get('/admin/photographers').expect(200);

    const third = request.agent(app.getHttpServer()).set('Origin', WEB);
    await third.post('/auth/login').send({ email: adminEmail, password: adminPassword }).expect(200);
    await third.post('/auth/mfa/verify').send({ recoveryCode: recovery }).expect(401);
  });

  it('lets the admin approve the photographer, writing an audit entry', async () => {
    // Photographer route-ууд хараахан байхгүй (Phase 2b) — батлалтыг /auth/me болон admin жагсаалтаар шалгана
    const pending = await adminAgent.get('/admin/photographers?status=PENDING').expect(200);
    expect(pending.body.map((p: { id: string }) => p.id)).toContain(photographerId);

    await adminAgent.post(`/admin/photographers/${photographerId}/reinstate`).expect(409);
    await adminAgent.post(`/admin/photographers/${photographerId}/approve`).expect(200);

    const me = await photographerAgent.get('/auth/me').expect(200);
    expect(me.body.status).toBe('APPROVED');

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: photographerId, action: 'photographer.approve' },
    });
    expect(audit).toMatchObject({ actorRole: 'ADMIN', before: { status: 'PENDING' }, after: { status: 'APPROVED' } });
    expect(audit?.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('logs a suspended photographer out everywhere', async () => {
    await adminAgent.post(`/admin/photographers/${photographerId}/suspend`).send({ reason: 'e2e шалгалт' }).expect(200);
    await photographerAgent.get('/auth/me').expect(401);
    const login = await photographer().post('/auth/login').send({ email: photographerEmail, password: photographerPassword });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('account_inactive');
  });

  it('does not reveal whether an email exists and rate-limits guessing', async () => {
    const guess = (email: string) =>
      photographer().post('/auth/login').send({ email, password: 'definitely-wrong' });
    const unknown = await guess(`nobody-${run}@pic.local`);
    const known = await guess(adminEmail);
    expect(unknown.status).toBe(401);
    expect(known.status).toBe(401);
    expect(unknown.body).toEqual(known.body);

    for (let i = 0; i < 4; i++) await guess(adminEmail).expect(401);
    // имэйл тутамд 15 минутад 5 оролдлого — 6 дахь нь 429
    const limited = await guess(adminEmail).expect(429);
    expect(limited.body.code).toBe('rate_limited');
    // зөв нууц үгтэй ч түгжигдсэн хэвээр
    await photographer().post('/auth/login').send({ email: adminEmail, password: adminPassword }).expect(429);
  });

  it('logout invalidates the session server-side', async () => {
    await adminAgent.post('/auth/logout').expect(204);
    await adminAgent.get('/auth/me').expect(401);
  });

  it('never stores raw session tokens', async () => {
    const sessions = await prisma.authSession.findMany({ where: { user: { email: adminEmail } } });
    for (const s of sessions) expect(s.id).toMatch(/^[0-9a-f]{64}$/);
  });

});
