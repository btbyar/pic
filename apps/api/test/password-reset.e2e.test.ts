import { ConfigService } from '@nestjs/config';
import type { EmailJob } from '@pic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mailer } from '../src/mail/mailer';
import { EMAIL_QUEUE, type EmailQueue } from '../src/queue/queue.module';
import { EmailService } from '../src/worker/email.service';
import { FakeMailer } from './fakes';
import { type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';

let ctx: TestContext;
let mailer: FakeMailer;
let user: { agent: Agent; userId: string; email: string };

const NEW_PASSWORD = 'brand-new-password-2';

/** API-ийн queue-д орсон имэйлийг worker-ийн адил илгээгээд холбоосыг буцаана */
async function deliverResetEmail(userId: string): Promise<string> {
  const reset = await ctx.prisma.passwordResetToken.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const job = await ctx.app.get<EmailQueue>(EMAIL_QUEUE).getJob(`password-reset-${reset.id}`);
  expect(job).toBeDefined();
  expect(JSON.stringify(job!.data)).not.toContain(user.email);
  await new EmailService(ctx.prisma, mailer, ctx.app.get(ConfigService)).process(job!.data as EmailJob);
  await job!.remove();
  return mailer.lastLink();
}

const tokenFrom = (link: string) => new URL(link).hash.replace('#token=', '');

beforeAll(async () => {
  mailer = new FakeMailer();
  ctx = await createTestContext((b) => b.overrideProvider(Mailer).useValue(mailer));
  user = await photographerAgent(ctx, 'forgetful');
});

afterAll(async () => {
  await ctx?.close();
});

describe('password reset', () => {
  let link: string;

  it('answers the same for unknown emails and sends nothing', async () => {
    const before = await ctx.prisma.passwordResetToken.count();
    await anonymous(ctx).post('/auth/password-reset').send({ email: `nobody-${ctx.run}@pic.local` }).expect(204);
    expect(await ctx.prisma.passwordResetToken.count()).toBe(before);
  });

  it('emails a one-time link with the token in the URL fragment, storing only its hash', async () => {
    await anonymous(ctx).post('/auth/password-reset').send({ email: user.email.toUpperCase() }).expect(204);
    link = await deliverResetEmail(user.userId);
    expect(link).toMatch(/^http:\/\/localhost:3000\/reset-password#token=[A-Za-z0-9_-]{43}$/);
    expect(mailer.sent.at(-1)!.to).toBe(user.email);

    const rows = await ctx.prisma.passwordResetToken.findMany({ where: { userId: user.userId } });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(tokenFrom(link));
    // expires_at-ийг API, created_at-ийг DB тавьдаг тул хэдэн ms зөрж болно
    expect(rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime()).toBeCloseTo(30 * 60_000, -4);
  });

  it('invalidates the previous link when a new one is requested', async () => {
    await anonymous(ctx).post('/auth/password-reset').send({ email: user.email }).expect(204);
    const newer = await deliverResetEmail(user.userId);
    const old = await anonymous(ctx)
      .post('/auth/password-reset/confirm')
      .send({ token: tokenFrom(link), password: NEW_PASSWORD })
      .expect(400);
    expect(old.body.code).toBe('reset_token_invalid');
    link = newer;
  });

  it('sets the new password, signs out every session and cannot be reused', async () => {
    await user.agent.get('/auth/me').expect(200);
    await anonymous(ctx).post('/auth/password-reset/confirm').send({ token: tokenFrom(link), password: 'short' }).expect(400);
    await anonymous(ctx).post('/auth/password-reset/confirm').send({ token: tokenFrom(link), password: NEW_PASSWORD }).expect(204);

    await user.agent.get('/auth/me').expect(401);
    await anonymous(ctx).post('/auth/login').send({ email: user.email, password: 'e2e-test-password-1' }).expect(401);
    await anonymous(ctx).post('/auth/login').send({ email: user.email, password: NEW_PASSWORD }).expect(200);

    const reuse = await anonymous(ctx)
      .post('/auth/password-reset/confirm')
      .send({ token: tokenFrom(link), password: 'another-password-3' })
      .expect(400);
    expect(reuse.body.code).toBe('reset_token_invalid');

    const audit = await ctx.prisma.auditLog.findFirst({ where: { entityId: user.userId, action: 'auth.password.reset' } });
    expect(audit).not.toBeNull();
  });

  it('rejects expired links and skips emails for them', async () => {
    await anonymous(ctx).post('/auth/password-reset').send({ email: user.email }).expect(204);
    const reset = await ctx.prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.userId, usedAt: null } });
    await ctx.prisma.passwordResetToken.update({ where: { id: reset.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const job = await ctx.app.get<EmailQueue>(EMAIL_QUEUE).getJob(`password-reset-${reset.id}`);
    const outcome = await new EmailService(ctx.prisma, mailer, ctx.app.get(ConfigService)).process(job!.data as EmailJob);
    expect(outcome).toBe('skipped');
    await job!.remove();
  });

  it('rate limits reset requests per email', async () => {
    const email = `limited-${ctx.run}@pic.local`;
    for (let i = 0; i < 3; i++) await anonymous(ctx).post('/auth/password-reset').send({ email }).expect(204);
    const res = await anonymous(ctx).post('/auth/password-reset').send({ email }).expect(429);
    expect(res.body.code).toBe('rate_limited');
  });
});
