import { ConfigService } from '@nestjs/config';
import type { EmailJob } from '@pic/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mailer } from '../src/mail/mailer';
import { MlClient } from '../src/ml/ml-client';
import { MockPaymentProvider } from '../src/payments/mock.provider';
import { OrderPaymentsService } from '../src/payments/order-payments.service';
import { PaymentProvider } from '../src/payments/payment-provider';
import { EMAIL_QUEUE, type EmailQueue } from '../src/queue/queue.module';
import { StorageService } from '../src/storage/storage.module';
import { EmailService } from '../src/worker/email.service';
import { IndexService } from '../src/worker/index.service';
import { IngestService } from '../src/worker/ingest.service';
import { FakeMl, fakeFace, vec } from './fake-ml';
import { FakeMailer } from './fakes';
import { type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';
import { type PhotoPipeline, uploadIndexedPhoto } from './photos';

let ctx: TestContext;
let ml: FakeMl;
let mailer: FakeMailer;
let owner: { agent: Agent; userId: string };
let pipeline: PhotoPipeline;
let event: { id: string; slug: string };
const photos: Record<string, { id: string; bytes: Buffer }> = {};

const SELFIE = vec({ 0: 1 });
const PRICE = 10_000;
const BUNDLE = 15_000;

const order = (agent: Agent, id: string, token: string) => agent.get(`/orders/${id}`).set('x-order-token', token);

async function selfieSearch(): Promise<string> {
  ml.faces = [fakeFace(SELFIE, 200)];
  const selfie = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#caa' } }).jpeg().toBuffer();
  const res = await anonymous(ctx)
    .post(`/events/${event.slug}/search`)
    .attach('selfie', selfie, { filename: 'me.jpg', contentType: 'image/jpeg' })
    .field('consent', 'true')
    .expect(200);
  return res.body.sessionId;
}

async function createEvent(title: string, pricing: { pricePerPhoto: number; bundlePrice?: number }) {
  const res = await owner.agent
    .post('/photographer/events')
    .send({
      title: `${title} ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      visibility: 'PUBLIC',
      ...pricing,
    })
    .expect(201);
  return res.body as { id: string; slug: string };
}

async function processEmailJob(jobId: string) {
  const job = await ctx.app.get<EmailQueue>(EMAIL_QUEUE).getJob(jobId);
  expect(job, `email job ${jobId}`).toBeDefined();
  const service = new EmailService(ctx.prisma, mailer, ctx.app.get(ConfigService));
  const outcome = await service.process(job!.data as EmailJob);
  await job!.remove();
  return outcome;
}

beforeAll(async () => {
  ml = await new FakeMl().listen();
  mailer = new FakeMailer();
  ctx = await createTestContext((b) =>
    b.overrideProvider(MlClient).useValue(ml.client()).overrideProvider(Mailer).useValue(mailer),
  );
  owner = await photographerAgent(ctx, 'seller');
  await ctx.prisma.photographerProfile.update({ where: { userId: owner.userId }, data: { revenueSharePct: 60 } });
  const storage = ctx.app.get(StorageService);
  pipeline = {
    ctx,
    agent: owner.agent,
    ml,
    ingest: new IngestService(ctx.prisma, storage),
    index: new IndexService(ctx.prisma, storage, ml.client()),
  };

  event = await createEvent('Orders', { pricePerPhoto: PRICE, bundlePrice: BUNDLE });
  photos['me1'] = await uploadIndexedPhoto(pipeline, event.id, 'me1', [fakeFace(vec({ 0: 0.9, 1: 0.436 }))]);
  photos['me2'] = await uploadIndexedPhoto(pipeline, event.id, 'me2', [fakeFace(vec({ 0: 0.8, 2: 0.6 }))]);
  photos['me3'] = await uploadIndexedPhoto(pipeline, event.id, 'me3', [fakeFace(vec({ 0: 0.85, 3: 0.527 }))]);
  photos['other'] = await uploadIndexedPhoto(pipeline, event.id, 'other', [fakeFace(vec({ 5: 1 }))]);
});

afterAll(async () => {
  await ctx?.close();
  ml?.close();
});

describe('pricing', () => {
  const mine = () => [photos['me1']!.id, photos['me2']!.id, photos['me3']!.id];

  it('charges per photo without a search and explains why the bundle does not apply', async () => {
    const res = await anonymous(ctx).post(`/events/${event.slug}/orders/quote`).send({ photoIds: mine() }).expect(200);
    expect(res.body).toMatchObject({
      pricePerPhoto: PRICE,
      bundlePrice: BUNDLE,
      unavailable: [],
      price: { subtotal: 30_000, total: 30_000, bundleApplied: false, bundleBlocker: 'no_search' },
    });
  });

  it('applies the bundle only when every photo came from the buyer’s own search', async () => {
    const sessionId = await selfieSearch();
    const own = await anonymous(ctx)
      .post(`/events/${event.slug}/orders/quote`)
      .send({ photoIds: mine(), searchSessionId: sessionId })
      .expect(200);
    expect(own.body.price).toMatchObject({ total: BUNDLE, bundleApplied: true });

    const withStranger = await anonymous(ctx)
      .post(`/events/${event.slug}/orders/quote`)
      .send({ photoIds: [...mine(), photos['other']!.id], searchSessionId: sessionId })
      .expect(200);
    expect(withStranger.body.price).toMatchObject({ total: 40_000, bundleBlocker: 'not_matched' });

    // Хайлтын өгөгдлөө устгасны дараа багц хэрэглэгдэхгүй
    await anonymous(ctx).delete(`/search-sessions/${sessionId}`).expect(204);
    const deleted = await anonymous(ctx)
      .post(`/events/${event.slug}/orders/quote`)
      .send({ photoIds: mine(), searchSessionId: sessionId })
      .expect(200);
    expect(deleted.body.price).toMatchObject({ total: 30_000, bundleBlocker: 'search_expired' });
  });

  it('reports photos that can no longer be bought', async () => {
    const hidden = await uploadIndexedPhoto(pipeline, event.id, 'hidden', [fakeFace(vec({ 7: 1 }))]);
    await ctx.prisma.photo.update({ where: { id: hidden.id }, data: { hiddenAt: new Date(), hiddenReason: 'removal' } });
    const unknown = '0190f5c2-3b1e-7c3a-9d2e-1a2b3c4d5e6f';

    const quote = await anonymous(ctx)
      .post(`/events/${event.slug}/orders/quote`)
      .send({ photoIds: [photos['me1']!.id, hidden.id, unknown] })
      .expect(200);
    expect(quote.body.photoIds).toEqual([photos['me1']!.id]);
    expect(quote.body.unavailable.sort()).toEqual([hidden.id, unknown].sort());

    const create = await anonymous(ctx)
      .post(`/events/${event.slug}/orders`)
      .send({ photoIds: [photos['me1']!.id, hidden.id] })
      .expect(409);
    expect(create.body).toMatchObject({ code: 'photos_unavailable', photoIds: [hidden.id] });
  });
});

describe('checkout with the mock provider', () => {
  let orderId: string;
  let token: string;

  it('creates a pending order with a QR invoice, priced and split on the server', async () => {
    const sessionId = await selfieSearch();
    const res = await anonymous(ctx)
      .post(`/events/${event.slug}/orders`)
      .send({ photoIds: [photos['me1']!.id, photos['me2']!.id, photos['me3']!.id], searchSessionId: sessionId, email: 'Buyer@Example.mn' })
      .expect(201);
    expect(res.body).toMatchObject({ total: BUNDLE, accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    orderId = res.body.id;
    token = res.body.accessToken;

    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    // Токен DB-д зөвхөн hash + (имэйл илгээх хүртэл) шифрлэгдсэн хэлбэрээр; хайлтын session хадгалагдаагүй
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(stored)).not.toContain(sessionId);
    expect(stored).toMatchObject({ status: 'PENDING', totalAmount: BUNDLE, contactEmail: 'buyer@example.mn' });
    expect(stored.accessTokenEnc).toMatch(/^v1\./);
    expect(stored.items.map((i) => i.price)).toEqual([5_000, 5_000, 5_000]);
    for (const item of stored.items) {
      expect(item).toMatchObject({ pricing: 'BUNDLE', photographerSharePct: 60, photographerAmount: 3_000, platformAmount: 2_000 });
    }

    const view = await order(anonymous(ctx), orderId, token).expect(200);
    expect(view.body).toMatchObject({
      status: 'PENDING',
      totalAmount: BUNDLE,
      bundleApplied: true,
      emailOnFile: true,
      mockPayment: true,
      payment: { provider: 'MOCK', qrText: expect.stringContaining('PIC-MOCK:') },
    });
    expect(view.body.items).toHaveLength(3);
    expect(view.body).not.toHaveProperty('contactEmail');
  });

  it('hides the order from anyone without the token', async () => {
    const wrong = await order(anonymous(ctx), orderId, 'x'.repeat(43)).expect(404);
    expect(wrong.body.code).toBe('order_not_found');
    const missing = await anonymous(ctx).get(`/orders/${orderId}`).expect(400);
    expect(missing.body.code).toBe('order_token_required');
    // Query-ээр ирсэн токеныг хүлээн авахгүй (log-д үлдэх эрсдэл)
    await anonymous(ctx).get(`/orders/${orderId}?t=${token}`).expect(400);
  });

  it('refuses downloads until paid', async () => {
    const view = await order(anonymous(ctx), orderId, token).expect(200);
    const res = await anonymous(ctx)
      .post(`/orders/${orderId}/items/${view.body.items[0].id}/download`)
      .set('x-order-token', token)
      .expect(409);
    expect(res.body.code).toBe('order_not_paid');
  });

  it('marks the order paid once, records stats and emails the private link', async () => {
    const statBefore = await ctx.prisma.eventDailyStat.findMany({ where: { eventId: event.id } });
    await anonymous(ctx).post(`/orders/${orderId}/mock-pay`).set('x-order-token', token).expect(200, { status: 'PAID' });
    // Давтан callback/polling давхар тоолохгүй
    const payments = ctx.app.get(OrderPaymentsService);
    expect(await payments.markPaid(orderId, null, null, null)).toBe(false);
    expect(await payments.reconcile(orderId)).toBe('PAID');

    const statAfter = await ctx.prisma.eventDailyStat.findMany({ where: { eventId: event.id } });
    const sum = (rows: typeof statAfter, k: 'orders' | 'revenue') => rows.reduce((s, r) => s + r[k], 0);
    expect(sum(statAfter, 'orders') - sum(statBefore, 'orders')).toBe(1);
    expect(sum(statAfter, 'revenue') - sum(statBefore, 'revenue')).toBe(BUNDLE);

    const view = await order(anonymous(ctx), orderId, token).expect(200);
    expect(view.body).toMatchObject({ status: 'PAID', payment: null, downloadableUntil: expect.any(String) });

    mailer.sent = [];
    expect(await processEmailJob(`order-paid-${orderId}`)).toBe('sent');
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('buyer@example.mn');
    expect(mailer.lastLink()).toBe(`http://localhost:3000/orders/${orderId}#t=${token}`);
    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(stored.accessTokenEnc).toBeNull();
    expect(stored.emailSentAt).not.toBeNull();
    // Давтан job юу ч илгээхгүй
    const again = new EmailService(ctx.prisma, mailer, ctx.app.get(ConfigService));
    expect(await again.process({ kind: 'order_paid', orderId })).toBe('skipped');
  });

  it('serves the untouched original through a short-lived attachment URL and logs the download', async () => {
    const view = await order(anonymous(ctx), orderId, token).expect(200);
    const item = view.body.items.find((i: { photoId: string }) => i.photoId === photos['me1']!.id);
    const res = await anonymous(ctx).post(`/orders/${orderId}/items/${item.id}/download`).set('x-order-token', token).expect(200);
    expect(res.body.url).toContain('X-Amz-Expires=300');

    const file = await fetch(res.body.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toMatch(/^attachment; filename="me1\.jpg"/);
    expect(Buffer.from(await file.arrayBuffer()).equals(photos['me1']!.bytes)).toBe(true);

    const downloads = await ctx.prisma.download.findMany({ where: { orderItemId: item.id } });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('stops downloads of photos hidden after purchase', async () => {
    const view = await order(anonymous(ctx), orderId, token).expect(200);
    const item = view.body.items.find((i: { photoId: string }) => i.photoId === photos['me3']!.id);
    await ctx.prisma.photo.update({ where: { id: photos['me3']!.id }, data: { hiddenAt: new Date(), hiddenReason: 'removal' } });
    const res = await anonymous(ctx).post(`/orders/${orderId}/items/${item.id}/download`).set('x-order-token', token).expect(410);
    expect(res.body.code).toBe('photo_unavailable');
    const after = await order(anonymous(ctx), orderId, token).expect(200);
    expect(after.body.items.find((i: { id: string }) => i.id === item.id)).toMatchObject({ available: false, thumbUrl: null });
    await ctx.prisma.photo.update({ where: { id: photos['me3']!.id }, data: { hiddenAt: null, hiddenReason: null } });
  });
});

describe('payment lifecycle', () => {
  it('expires unpaid orders but still accepts a payment that arrived before the final check', async () => {
    const payments = ctx.app.get(OrderPaymentsService);
    const provider = ctx.app.get(PaymentProvider) as MockPaymentProvider;
    const create = () =>
      anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [photos['other']!.id] }).expect(201);
    const unpaid = (await create()).body;
    const late = (await create()).body;

    const latePayment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: late.id } });
    await provider.simulatePayment(latePayment.providerInvoiceId);
    await ctx.prisma.order.updateMany({
      where: { id: { in: [unpaid.id, late.id] } },
      data: { paymentDueAt: new Date(Date.now() - 60_000) },
    });

    const result = await payments.expireDue();
    expect(result.paid).toBeGreaterThanOrEqual(1);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const [u, l] = await Promise.all([
      ctx.prisma.order.findUniqueOrThrow({ where: { id: unpaid.id }, include: { payments: true } }),
      ctx.prisma.order.findUniqueOrThrow({ where: { id: late.id } }),
    ]);
    expect(u.status).toBe('EXPIRED');
    expect(u.payments[0]!.status).toBe('EXPIRED');
    expect(l.status).toBe('PAID');
    // Цуцлагдсан mock нэхэмжлэхийг төлөх боломжгүй
    await anonymous(ctx).post(`/orders/${unpaid.id}/mock-pay`).set('x-order-token', unpaid.accessToken).expect(409);
  });

  it('completes free orders immediately without an invoice', async () => {
    const free = await createEvent('Free', { pricePerPhoto: 0 });
    const photo = await uploadIndexedPhoto(pipeline, free.id, 'free', [fakeFace(vec({ 9: 1 }))]);
    const res = await anonymous(ctx).post(`/events/${free.slug}/orders`).send({ photoIds: [photo.id] }).expect(201);
    expect(res.body.total).toBe(0);
    const view = await order(anonymous(ctx), res.body.id, res.body.accessToken).expect(200);
    expect(view.body).toMatchObject({ status: 'PAID', totalAmount: 0, payment: null });
    expect(await ctx.prisma.payment.count({ where: { orderId: res.body.id } })).toBe(0);
  });

  it('validates carts', async () => {
    const empty = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [] }).expect(400);
    expect(empty.body.code).toBe('validation_failed');
    await anonymous(ctx)
      .post(`/events/${event.slug}/orders`)
      .send({ photoIds: [photos['me1']!.id, photos['me1']!.id] })
      .expect(400);
    await anonymous(ctx).post(`/events/unknown-${ctx.run}/orders`).send({ photoIds: [photos['me1']!.id] }).expect(404);
  });
});
