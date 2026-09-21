import { payoutPeriod } from '@pic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MlClient } from '../src/ml/ml-client';
import { StorageService } from '../src/storage/storage.module';
import { IndexService } from '../src/worker/index.service';
import { IngestService } from '../src/worker/ingest.service';
import { FakeMl, fakeFace, vec } from './fake-ml';
import { type AdminAgent, adminAgent, type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';
import { uploadIndexedPhoto } from './photos';

let ctx: TestContext;
let ml: FakeMl;
let admin: AdminAgent;
let seller: { agent: Agent; userId: string };
let event: { id: string; slug: string };
let order: { id: string; accessToken: string };
let items: { id: string; price: number }[];

// Өмнөх сарын дунд (Улаанбаатарын цагаар хаагдсан сар)
const now = new Date();
const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 10 * 24 * 3600_000);
const PREV = payoutPeriod(lastMonth);
const CURRENT = payoutPeriod(now);

async function paidOrder(photoIds: string[], email?: string) {
  const res = await anonymous(ctx)
    .post(`/events/${event.slug}/orders`)
    .send({ photoIds, ...(email ? { email } : {}) })
    .expect(201);
  await anonymous(ctx).post(`/orders/${res.body.id}/mock-pay`).set('x-order-token', res.body.accessToken).expect(200);
  return res.body as { id: string; accessToken: string };
}

beforeAll(async () => {
  ml = await new FakeMl().listen();
  ctx = await createTestContext((b) => b.overrideProvider(MlClient).useValue(ml.client()));
  admin = await adminAgent(ctx, 'finance');
  seller = await photographerAgent(ctx, 'earner');
  await ctx.prisma.photographerProfile.update({ where: { userId: seller.userId }, data: { revenueSharePct: 60 } });
  const storage = ctx.app.get(StorageService);
  const pipeline = {
    ctx,
    agent: seller.agent,
    ml,
    ingest: new IngestService(ctx.prisma, storage),
    index: new IndexService(ctx.prisma, storage, ml.client()),
  };
  const res = await seller.agent
    .post('/photographer/events')
    .send({
      title: `Finance ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      visibility: 'PUBLIC',
      pricePerPhoto: 10_000,
    })
    .expect(201);
  event = res.body;
  const a = await uploadIndexedPhoto(pipeline, event.id, 'fin-a', [fakeFace(vec({ 0: 1 }))]);
  const b = await uploadIndexedPhoto(pipeline, event.id, 'fin-b', [fakeFace(vec({ 1: 1 }))]);

  order = await paidOrder([a.id, b.id], `finance-${ctx.run}@example.mn`);
  // Худалдан авалтыг өмнөх сард хийгдсэн болгоно
  await ctx.prisma.order.update({ where: { id: order.id }, data: { paidAt: lastMonth } });
  items = (await ctx.prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { id: 'asc' } })).map((i) => ({ id: i.id, price: i.price }));
});

afterAll(async () => {
  await ctx?.close();
  ml?.close();
});

describe('orders', () => {
  it('lets admins find and inspect orders, and nobody else', async () => {
    await seller.agent.get('/admin/orders').expect(403);
    const list = await admin.agent.get(`/admin/orders?q=finance-${ctx.run}`).expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ id: order.id, status: 'PAID', totalAmount: 20_000, itemCount: 2 }),
    ]);
    const detail = await admin.agent.get(`/admin/orders/${order.id}`).expect(200);
    expect(detail.body.items).toHaveLength(2);
    expect(detail.body.items[0]).toMatchObject({ price: 10_000, photographerAmount: 6_000, platformAmount: 4_000, refunded: false });
    expect(detail.body.payments[0]).toMatchObject({ provider: 'MOCK', status: 'PAID', amount: 20_000 });
  });
});

describe('sales', () => {
  it('shows a photographer their own sales per event and recent orders, without buyer details', async () => {
    await anonymous(ctx).get('/photographer/sales').expect(401);
    await admin.agent.get('/photographer/sales').expect(403);
    const res = await seller.agent.get('/photographer/sales').expect(200);
    // 60% × 10 000₮ × 2 зураг
    expect(res.body.byEvent).toEqual([{ eventId: event.id, photos: 2, amount: 12_000 }]);
    expect(res.body.recent).toEqual([
      { id: order.id, eventId: event.id, eventTitle: `Finance ${ctx.run}`, paidAt: lastMonth.toISOString(), photos: 2, amount: 12_000, bundle: false, refunded: false },
    ]);

    const other = await photographerAgent(ctx, 'no-sales');
    const empty = await other.agent.get('/photographer/sales').expect(200);
    expect(empty.body).toEqual({ byEvent: [], recent: [] });
  });
});

describe('payouts', () => {
  it('shows what each photographer earned in a closed month, with their bank account', async () => {
    const before = await admin.agent.get(`/admin/payouts?period=${PREV}`).expect(200);
    const row = before.body.rows.find((r: { photographerId: string }) => r.photographerId === seller.userId);
    expect(row).toMatchObject({ gross: 12_000, refunded: 0, payable: 12_000, account: null, payout: null });
    expect(before.body.closed).toBe(true);

    const acc = await seller.agent
      .put('/photographer/payout-account')
      .send({ bankName: 'Хаан банк', accountNumber: '5012345678', accountName: 'Бат Болд' })
      .expect(200);
    expect(acc.body.account.accountNumber).toBe('••••5678');
    const profile = await ctx.prisma.photographerProfile.findUniqueOrThrow({ where: { userId: seller.userId } });
    expect(profile.bankAccountEnc).toMatch(/^v1\./);
    expect(profile.bankAccountEnc).not.toContain('5012345678');

    const after = await admin.agent.get(`/admin/payouts?period=${PREV}`).expect(200);
    expect(after.body.rows.find((r: { photographerId: string }) => r.photographerId === seller.userId).account).toEqual({
      bankName: 'Хаан банк',
      accountNumber: '5012345678',
      accountName: 'Бат Болд',
    });
  });

  it('marks a closed month paid once, only with a fresh TOTP code', async () => {
    const body = { photographerId: seller.userId, period: PREV, reference: 'KHAN-TXN-123' };
    await admin.agent.post('/admin/payouts/mark-paid').send(body).expect(401);
    const paid = await admin.agent
      .post('/admin/payouts/mark-paid')
      .send({ ...body, totpCode: await admin.stepUpCode() })
      .expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID', netAmount: 12_000 });

    const again = await admin.agent
      .post('/admin/payouts/mark-paid')
      .send({ ...body, totpCode: await admin.stepUpCode() })
      .expect(409);
    expect(again.body.code).toBe('payout_already_paid');

    const open = await admin.agent
      .post('/admin/payouts/mark-paid')
      .send({ ...body, period: CURRENT, totpCode: await admin.stepUpCode() })
      .expect(409);
    expect(open.body.code).toBe('period_not_closed');
  });
});

describe('refunds', () => {
  it('refunds single photos, blocks their download and deducts from the next payout', async () => {
    await admin.agent.post(`/admin/orders/${order.id}/refunds`).send({ itemIds: [items[0]!.id], reason: 'Буруу хүн' }).expect(401);
    const res = await admin.agent
      .post(`/admin/orders/${order.id}/refunds`)
      .send({ itemIds: [items[0]!.id], reason: 'Буруу хүний зураг байсан', providerRef: 'KHAN-REF-9', totpCode: await admin.stepUpCode() })
      .expect(201);
    expect(res.body).toMatchObject({ amount: 10_000, status: 'PARTIALLY_REFUNDED' });

    const twice = await admin.agent
      .post(`/admin/orders/${order.id}/refunds`)
      .send({ itemIds: [items[0]!.id], reason: 'дахин', totpCode: await admin.stepUpCode() })
      .expect(409);
    expect(twice.body.code).toBe('items_not_refundable');

    // Буцаасан зургийг татахгүй, бусдыг нь татна
    const refunded = await anonymous(ctx)
      .post(`/orders/${order.id}/items/${items[0]!.id}/download`)
      .set('x-order-token', order.accessToken)
      .expect(410);
    expect(refunded.body.code).toBe('photo_unavailable');
    await anonymous(ctx).post(`/orders/${order.id}/items/${items[1]!.id}/download`).set('x-order-token', order.accessToken).expect(200);

    // Өмнөх сарын төлбөр хэвээр; энэ сард −6000 суутгал
    const earnings = await seller.agent.get('/photographer/earnings').expect(200);
    expect(earnings.body.account).toEqual({ bankName: 'Хаан банк', accountNumber: '••••5678', accountName: 'Бат Болд' });
    const months = Object.fromEntries(earnings.body.months.map((m: { period: string }) => [m.period, m]));
    expect(months[PREV]).toMatchObject({ gross: 12_000, payable: 12_000, payout: { status: 'PAID', reference: 'KHAN-TXN-123' } });
    expect(months[CURRENT]).toMatchObject({ gross: 0, refunded: 6_000, net: -6_000, payable: 0 });

    const audit = await ctx.prisma.auditLog.findFirst({ where: { entityId: order.id, action: 'refund.create' } });
    expect(audit?.reason).toBe('Буруу хүний зураг байсан');
  });

  it('fully refunds the rest and refuses unpaid orders', async () => {
    const res = await admin.agent
      .post(`/admin/orders/${order.id}/refunds`)
      .send({ itemIds: [items[1]!.id], reason: 'Хэрэглэгч гомдол гаргасан', totpCode: await admin.stepUpCode() })
      .expect(201);
    expect(res.body.status).toBe('REFUNDED');

    const photo = (await ctx.prisma.photo.findFirstOrThrow({ where: { eventId: event.id } })).id;
    const pending = await anonymous(ctx).post(`/events/${event.slug}/orders`).send({ photoIds: [photo] }).expect(201);
    const pendingItem = await ctx.prisma.orderItem.findFirstOrThrow({ where: { orderId: pending.body.id } });
    const denied = await admin.agent
      .post(`/admin/orders/${pending.body.id}/refunds`)
      .send({ itemIds: [pendingItem.id], reason: 'төлөөгүй', totpCode: await admin.stepUpCode() })
      .expect(409);
    expect(denied.body.code).toBe('order_not_refundable');
  });
});
