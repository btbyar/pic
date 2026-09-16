import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';

let ctx: TestContext;
let owner: { agent: Agent; userId: string; email: string };
let colleague: { agent: Agent; userId: string; email: string };
let outsider: { agent: Agent; userId: string; email: string };

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await photographerAgent(ctx, 'owner');
  colleague = await photographerAgent(ctx, 'colleague');
  outsider = await photographerAgent(ctx, 'outsider');
});

afterAll(async () => {
  await ctx?.close();
});

const baseEvent = () => ({
  title: `Туул гүйлт ${ctx.run}`,
  startsAt: '2026-06-14T07:00:00+08:00',
  endsAt: '2026-06-14T15:00:00+08:00',
  pricePerPhoto: 15_000,
  bundlePrice: 60_000,
  bibPattern: '^[0-9]{3,5}$',
});

describe('events', () => {
  let eventId: string;
  let slug: string;
  let accessLink: string;

  it('blocks pending photographers from creating events', async () => {
    const pending = await photographerAgent(ctx, 'pending', 'PENDING');
    const res = await pending.agent.post('/photographer/events').send(baseEvent()).expect(403);
    expect(res.body.code).toBe('account_pending');
  });

  it('creates a hidden event with a transliterated slug and retention date', async () => {
    const res = await owner.agent.post('/photographer/events').send(baseEvent()).expect(201);
    expect(res.body).toMatchObject({ visibility: 'HIDDEN', isOwner: true, retentionDays: 180, photoCount: 0 });
    expect(res.body.slug).toBe(`tuul-guilt-${ctx.run}`);
    // endsAt (2026-06-14 07:00Z) + 180 хоног
    expect(res.body.expiresAt).toBe('2026-12-11T07:00:00.000Z');
    expect(res.body.accessLink).toBeUndefined();
    eventId = res.body.id;
    slug = res.body.slug;

    const dup = await owner.agent.post('/photographer/events').send(baseEvent()).expect(201);
    expect(dup.body.slug).toMatch(new RegExp(`^tuul-guilt-${ctx.run}-[a-z0-9]+$`));
  });

  it('validates input with field-level errors', async () => {
    const res = await owner.agent
      .post('/photographer/events')
      .send({ ...baseEvent(), endsAt: '2026-06-13T00:00:00+08:00', pricePerPhoto: -1 })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['pricePerPhoto']));
  });

  it('keeps hidden events invisible to the public but visible to the owner', async () => {
    await anonymous(ctx).get(`/events/${slug}`).expect(404);
    await outsider.agent.get(`/events/${slug}`).expect(404);
    await owner.agent.get(`/events/${slug}`).expect(200);
    const list = await anonymous(ctx).get('/events').query({ q: ctx.run }).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('issues a secret link when made unlisted; only the link opens it', async () => {
    const res = await owner.agent.patch(`/photographer/events/${eventId}`).send({ visibility: 'UNLISTED' }).expect(200);
    accessLink = res.body.accessLink;
    expect(accessLink).toMatch(new RegExp(`/events/${slug}\\?t=[A-Za-z0-9_-]+$`));
    const token = new URL(accessLink).searchParams.get('t')!;

    await anonymous(ctx).get(`/events/${slug}`).expect(404);
    await anonymous(ctx).get(`/events/${slug}`).query({ t: 'wrong-token' }).expect(404);
    const page = await anonymous(ctx).get(`/events/${slug}`).query({ t: token }).expect(200);
    expect(page.body).toMatchObject({ slug, pricePerPhoto: 15_000, photographers: [expect.stringContaining('owner')] });
    // Нийтийн хариунд дотоод талбар гарахгүй
    expect(page.body).not.toHaveProperty('visibility');
    expect(page.body).not.toHaveProperty('bibPattern');
    expect(JSON.stringify(page.body)).not.toContain('accessTokenHash');

    const stored = await ctx.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(stored.accessTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.accessTokenHash).not.toContain(token);

    // Unlisted нь жагсаалтад гарахгүй
    const list = await anonymous(ctx).get('/events').query({ q: ctx.run }).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('rotating the link revokes the old one', async () => {
    const oldToken = new URL(accessLink).searchParams.get('t')!;
    const res = await owner.agent.post(`/photographer/events/${eventId}/access-link`).expect(200);
    const newToken = new URL(res.body.accessLink).searchParams.get('t')!;
    await anonymous(ctx).get(`/events/${slug}`).query({ t: oldToken }).expect(404);
    await anonymous(ctx).get(`/events/${slug}`).query({ t: newToken }).expect(200);
  });

  it('lists public events and filters by category', async () => {
    const res = await owner.agent
      .patch(`/photographer/events/${eventId}`)
      .send({ visibility: 'PUBLIC', category: 'RUNNING' })
      .expect(200);
    expect(res.body.category).toBe('RUNNING');

    const list = await anonymous(ctx).get('/events').query({ q: ctx.run }).expect(200);
    expect(list.body.items.map((e: { id: string }) => e.id)).toContain(eventId);
    expect(list.body.items.find((e: { id: string }) => e.id === eventId).category).toBe('RUNNING');

    const running = await anonymous(ctx).get('/events').query({ q: ctx.run, category: 'RUNNING' }).expect(200);
    expect(running.body.items.map((e: { id: string }) => e.id)).toContain(eventId);
    const concerts = await anonymous(ctx).get('/events').query({ q: ctx.run, category: 'CONCERT' }).expect(200);
    expect(concerts.body.items).toHaveLength(0);
    await anonymous(ctx).get('/events').query({ category: 'PARTY' }).expect(400);
  });

  it('recomputes expiry when the end date changes and rejects inverted dates', async () => {
    const res = await owner.agent
      .patch(`/photographer/events/${eventId}`)
      .send({ endsAt: '2026-06-15T15:00:00+08:00' })
      .expect(200);
    expect(res.body.expiresAt).toBe('2026-12-12T07:00:00.000Z');

    const bad = await owner.agent
      .patch(`/photographer/events/${eventId}`)
      .send({ startsAt: '2026-07-01T00:00:00+08:00' })
      .expect(400);
    expect(bad.body.code).toBe('validation_failed');
  });

  it('does not reveal other photographers’ events', async () => {
    await outsider.agent.get(`/photographer/events/${eventId}`).expect(404);
    await outsider.agent.patch(`/photographer/events/${eventId}`).send({ title: 'Хакердсан' }).expect(404);
    await outsider.agent.delete(`/photographer/events/${eventId}`).expect(404);
  });

  it('lets the owner invite a colleague who can view but not edit', async () => {
    await owner.agent.post(`/photographer/events/${eventId}/photographers`).send({ email: 'nobody@pic.local' }).expect(404);
    const res = await owner.agent
      .post(`/photographer/events/${eventId}/photographers`)
      .send({ email: colleague.email.toUpperCase() })
      .expect(201);
    expect(res.body.photographers).toHaveLength(2);
    await owner.agent.post(`/photographer/events/${eventId}/photographers`).send({ email: colleague.email }).expect(409);

    const mine = await colleague.agent.get('/photographer/events').expect(200);
    expect(mine.body.map((e: { id: string }) => e.id)).toContain(eventId);
    const detail = await colleague.agent.get(`/photographer/events/${eventId}`).expect(200);
    expect(detail.body.isOwner).toBe(false);
    // Эзэмшигч биш бол бусдын имэйлийг харахгүй
    expect(detail.body.photographers.every((p: { email?: string }) => p.email === undefined)).toBe(true);

    const edit = await colleague.agent.patch(`/photographer/events/${eventId}`).send({ title: 'Өөрчилсөн' }).expect(403);
    expect(edit.body.code).toBe('not_event_owner');

    const offset = await colleague.agent.put(`/photographer/events/${eventId}/clock-offset`).send({ clockOffsetSec: -125 }).expect(200);
    expect(offset.body.myClockOffsetSec).toBe(-125);

    await owner.agent.delete(`/photographer/events/${eventId}/photographers/${owner.userId}`).expect(409);
    await owner.agent.delete(`/photographer/events/${eventId}/photographers/${colleague.userId}`).expect(200);
    await colleague.agent.get(`/photographer/events/${eventId}`).expect(404);
  });

  it('soft-deletes with an audit entry and hides the event everywhere', async () => {
    await owner.agent.delete(`/photographer/events/${eventId}`).expect(204);
    await owner.agent.get(`/photographer/events/${eventId}`).expect(404);
    await anonymous(ctx).get(`/events/${slug}`).expect(404);

    const stored = await ctx.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(stored.deletedAt).not.toBeNull();
    const audit = await ctx.prisma.auditLog.findFirst({ where: { entityId: eventId, action: 'event.delete' } });
    expect(audit?.actorId).toBe(owner.userId);
  });
});
