import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AdminAgent, adminAgent, type Agent, anonymous, createTestContext, photographerAgent, type TestContext } from './helpers';

let ctx: TestContext;
let admin: AdminAgent;
let bat: { agent: Agent; userId: string };
let dorj: { agent: Agent; userId: string };
let slug: string;

async function event(agent: Agent, title: string, visibility: 'PUBLIC' | 'HIDDEN') {
  const res = await agent
    .post('/photographer/events')
    .send({
      title: `${title} ${ctx.run}`,
      startsAt: '2026-06-14T07:00:00+08:00',
      endsAt: '2026-06-14T15:00:00+08:00',
      visibility,
      pricePerPhoto: 5_000,
    })
    .expect(201);
  return res.body as { id: string; slug: string };
}

beforeAll(async () => {
  ctx = await createTestContext();
  admin = await adminAgent(ctx, 'profiles');
  bat = await photographerAgent(ctx, 'profile-bat');
  dorj = await photographerAgent(ctx, 'profile-dorj');
  slug = `bat-studio-${ctx.run}`;
});

afterAll(async () => {
  await ctx?.close();
});

describe('photographer profiles', () => {
  it('stays hidden until the photographer publishes a profile', async () => {
    const list = await anonymous(ctx).get('/photographers').expect(200);
    expect(list.body.map((p: { displayName: string }) => p.displayName)).not.toContain(`E2E e2e-profile-bat-${ctx.run}`);

    const mine = await bat.agent.get('/photographer/profile').expect(200);
    expect(mine.body).toMatchObject({ slugSaved: false, slug: expect.stringMatching(/^e2e-e2e-profile-bat/) });
  });

  it('publishes a profile with only public events', async () => {
    const res = await bat.agent
      .put('/photographer/profile')
      .send({ displayName: 'Бат студи', slug: slug.toUpperCase(), city: 'Улаанбаатар', bio: 'Спортын зурагчин' })
      .expect(200);
    expect(res.body).toMatchObject({ displayName: 'Бат студи', slug, slugSaved: true });

    const pub = await event(bat.agent, 'Profile public', 'PUBLIC');
    await event(bat.agent, 'Profile hidden', 'HIDDEN');

    const list = await anonymous(ctx).get('/photographers').expect(200);
    expect(list.body).toContainEqual(expect.objectContaining({ slug, displayName: 'Бат студи', city: 'Улаанбаатар', eventCount: 1 }));

    const found = await anonymous(ctx).get('/photographers').query({ q: 'бат студ' }).expect(200);
    expect(found.body.map((p: { slug: string }) => p.slug)).toContain(slug);
    const none = await anonymous(ctx).get('/photographers').query({ q: `zzz-${ctx.run}` }).expect(200);
    expect(none.body).toEqual([]);

    const page = await anonymous(ctx).get(`/photographers/${slug}`).expect(200);
    expect(page.body).toMatchObject({ displayName: 'Бат студи', bio: 'Спортын зурагчин', photoCount: 0 });
    expect(page.body.events.map((e: { slug: string }) => e.slug)).toEqual([pub.slug]);
    expect(page.body).not.toHaveProperty('email');

    // Эвэнтийн хуудас зурагчны профайл руу холбоно
    const ev = await anonymous(ctx).get(`/events/${pub.slug}`).expect(200);
    expect(ev.body.photographers).toEqual([{ name: 'Бат студи', slug }]);
  });

  it('keeps slugs unique and URL-safe', async () => {
    const taken = await dorj.agent.put('/photographer/profile').send({ displayName: 'Дорж', slug }).expect(409);
    expect(taken.body.code).toBe('slug_taken');
    await dorj.agent.put('/photographer/profile').send({ displayName: 'Дорж', slug: 'дорж' }).expect(400);
  });

  it('stores a small square WebP avatar without metadata', async () => {
    const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#468' } })
      .withMetadata({ exif: { IFD0: { Artist: 'secret' } } })
      .jpeg()
      .toBuffer();
    const res = await bat.agent.post('/photographer/profile/avatar').attach('avatar', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(200);
    const img = Buffer.from(await (await fetch(res.body.avatarUrl)).arrayBuffer());
    const meta = await sharp(img).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();

    await bat.agent
      .post('/photographer/profile/avatar')
      .attach('avatar', Buffer.from('not an image'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(415);
  });

  it('disappears when the photographer is suspended', async () => {
    await admin.agent.post(`/admin/photographers/${bat.userId}/suspend`).send({ reason: 'шалгалт' }).expect(200);
    await anonymous(ctx).get(`/photographers/${slug}`).expect(404);
    await admin.agent.post(`/admin/photographers/${bat.userId}/reinstate`).expect(200);
    await anonymous(ctx).get(`/photographers/${slug}`).expect(200);
  });
});

describe('home stats', () => {
  it('counts public events, photos and photographers (cached)', async () => {
    await ctx.redis.del('cache:home-stats');
    const res = await anonymous(ctx).get('/stats').expect(200);
    expect(res.body).toEqual({ events: expect.any(Number), photos: expect.any(Number), photographers: expect.any(Number) });
    expect(res.body.photographers).toBeGreaterThanOrEqual(2);
    expect(await ctx.redis.ttl('cache:home-stats')).toBeGreaterThan(500);
  });
});
