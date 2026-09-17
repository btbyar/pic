import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { MlClient } from '../src/ml/ml-client';
import { OrderPaymentsService } from '../src/payments/order-payments.service';
import { PaymentProvider } from '../src/payments/payment-provider';
import { QPayProvider } from '../src/payments/qpay.provider';
import { StorageService } from '../src/storage/storage.module';
import { IndexService } from '../src/worker/index.service';
import { IngestService } from '../src/worker/ingest.service';
import { FakeMl, fakeFace, vec } from './fake-ml';
import { FakeQPay } from './fakes';
import { type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';
import { uploadIndexedPhoto } from './photos';

let ctx: TestContext;
let ml: FakeMl;
let qpay: FakeQPay;
let owner: { agent: Agent; userId: string };
let event: { id: string; slug: string };
let photoId: string;

const CALLBACK = 'https://pic.example.mn/api/payments/qpay/callback';

function qpayProvider(url: string) {
  const values: Partial<Env> = {
    QPAY_BASE_URL: url,
    QPAY_USERNAME: qpay.username,
    QPAY_PASSWORD: qpay.password,
    QPAY_INVOICE_CODE: 'PIC_INVOICE',
    QPAY_CALLBACK_URL: CALLBACK,
  };
  return new QPayProvider({ get: (k: keyof Env) => values[k] } as unknown as ConfigService<Env, true>);
}

beforeAll(async () => {
  ml = await new FakeMl().listen();
  qpay = await new FakeQPay().listen();
  ctx = await createTestContext((b) =>
    b.overrideProvider(MlClient).useValue(ml.client()).overrideProvider(PaymentProvider).useValue(qpayProvider(qpay.url)),
  );
  owner = await photographerAgent(ctx, 'qpay-seller');
  const storage = ctx.app.get(StorageService);
  const res = await owner.agent
    .post('/photographer/events')
    .send({
      title: `QPay ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      visibility: 'PUBLIC',
      pricePerPhoto: 12_000,
    })
    .expect(201);
  event = res.body;
  const pipeline = {
    ctx,
    agent: owner.agent,
    ml,
    ingest: new IngestService(ctx.prisma, storage),
    index: new IndexService(ctx.prisma, storage, ml.client()),
  };
  photoId = (await uploadIndexedPhoto(pipeline, event.id, 'qpay', [fakeFace(vec({ 0: 1 }))])).id;
});

afterAll(async () => {
  await ctx?.close();
  ml?.close();
  qpay?.close();
});

describe('QPay', () => {
  it('creates an invoice with merchant credentials and our payment id in the callback', async () => {
    const res = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [photoId] }).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: res.body.id } });
    expect(payment).toMatchObject({ provider: 'QPAY', status: 'PENDING', amount: 12_000, providerInvoiceId: expect.stringMatching(/^inv-/) });
    const inv = payment.providerInvoiceId;

    const invoiceReq = qpay.requests.find((r) => r.path === '/v2/invoice')!;
    expect(invoiceReq.headers.authorization).toMatch(/^Bearer token-/);
    expect(invoiceReq.body).toMatchObject({
      invoice_code: 'PIC_INVOICE',
      sender_invoice_no: payment.id,
      amount: 12_000,
      callback_url: `${CALLBACK}?payment=${payment.id}`,
    });

    const view = await anonymous(ctx).get(`/orders/${res.body.id}`).set('x-order-token', res.body.accessToken).expect(200);
    expect(view.body).toMatchObject({
      mockPayment: false,
      payment: {
        provider: 'QPAY',
        qrText: `QPAY-QR-${inv}`,
        shortUrl: `https://s.qpay.mn/${inv}`,
        deeplinks: [{ name: 'Khan bank', link: `khanbank://q?qPay_QRcode=${inv}` }],
      },
    });
    // Mock төлбөр QPay горимд хаалттай
    await anonymous(ctx).post(`/orders/${res.body.id}/mock-pay`).set('x-order-token', res.body.accessToken).expect(404);
  });

  it('never trusts the callback itself — only a confirmed payment/check marks the order paid', async () => {
    const res = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [photoId] }).expect(201);
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: res.body.id } });

    // Төлөөгүй байхад ирсэн (хуурамч) callback
    const early = await anonymous(ctx).get(`/payments/qpay/callback?payment=${payment.id}`).expect(200);
    expect(early.text).toBe('SUCCESS');
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: res.body.id } })).status).toBe('PENDING');

    // Дутуу төлбөр
    qpay.pay(payment.providerInvoiceId, 5_000);
    await anonymous(ctx).post(`/payments/qpay/callback?payment=${payment.id}`).send({}).expect(200);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: res.body.id } })).status).toBe('PENDING');

    qpay.pay(payment.providerInvoiceId);
    await anonymous(ctx).get(`/payments/qpay/callback?payment=${payment.id}`).expect(200);
    const paid = await ctx.prisma.order.findUniqueOrThrow({ where: { id: res.body.id }, include: { payments: true } });
    expect(paid.status).toBe('PAID');
    expect(paid.payments[0]).toMatchObject({ status: 'PAID', providerPaymentId: `pay-${payment.providerInvoiceId}` });

    // Буруу/хоосон ID-д ч SUCCESS (юу ч задруулахгүй)
    await anonymous(ctx).get('/payments/qpay/callback?payment=nope').expect(200, 'SUCCESS');
  });

  it('re-authenticates once when the QPay token expires', async () => {
    const before = qpay.tokensIssued;
    qpay.expireTokenOnce = true;
    await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [photoId] }).expect(201);
    expect(qpay.tokensIssued).toBe(before + 1);
  });

  it('keeps working when QPay is down: 503 on checkout, order page still loads', async () => {
    const ok = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [photoId] }).expect(201);
    qpay.failAll = true;
    try {
      const res = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [photoId] }).expect(503);
      expect(res.body.code).toBe('payment_unavailable');
      expect(await ctx.prisma.order.count({ where: { eventId: event.id, status: 'FAILED' } })).toBe(1);

      await ctx.redis.del(`paycheck:${ok.body.id}`);
      const view = await anonymous(ctx).get(`/orders/${ok.body.id}`).set('x-order-token', ok.body.accessToken).expect(200);
      expect(view.body.status).toBe('PENDING');

      // Хугацаа дууссан ч QPay хариу өгөхгүй байхад EXPIRED болгохгүй (төлсөн байж болно)
      await ctx.prisma.order.update({ where: { id: ok.body.id }, data: { paymentDueAt: new Date(Date.now() - 60_000) } });
      await ctx.app.get(OrderPaymentsService).expireDue();
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: ok.body.id } })).status).toBe('PENDING');
    } finally {
      qpay.failAll = false;
    }
    await ctx.app.get(OrderPaymentsService).expireDue();
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: ok.body.id } })).status).toBe('EXPIRED');
    const invoice = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: ok.body.id } });
    expect(qpay.invoices.get(invoice.providerInvoiceId)?.cancelled).toBe(true);
  });
});
