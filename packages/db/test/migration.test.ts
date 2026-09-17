// Migration SQL-ийг жинхэнэ Postgres (PGlite + pgvector) дээр ажиллуулж,
// гараар нэмсэн хамгаалалтууд (role, CHECK, trigger, cascade) ажиллаж буйг шалгана.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrationsDir = join(import.meta.dirname, '..', 'prisma', 'migrations');
const DIM = 128; // SFace

/** i-р тэнхлэг дээрх нэгж вектор (pgvector текст формат) */
const unitVector = (i: number) => `[${Array.from({ length: DIM }, (_, k) => (k === i ? 1 : 0)).join(',')}]`;

let db: PGlite;
let userId: string;
let eventId: string;

async function insertReturningId(sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await db.query<{ id: string }>(sql, params);
  return rows[0]!.id;
}

const insertPhoto = () =>
  insertReturningId(
    `INSERT INTO photo (id, event_id, photographer_id, original_filename, storage_keys, bytes, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'a.jpg', '{}', 1, now()) RETURNING id`,
    [eventId, userId],
  );

beforeAll(async () => {
  db = await PGlite.create({ extensions: { vector } });
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dir of dirs) {
    await db.exec(readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8'));
  }

  userId = await insertReturningId(
    `INSERT INTO "user" (id, email, password_hash, role, status, display_name, updated_at)
     VALUES (gen_random_uuid(), 'p@pic.local', 'x', 'PHOTOGRAPHER', 'APPROVED', 'P', now()) RETURNING id`,
  );
  eventId = await insertReturningId(
    `INSERT INTO event (id, slug, title, starts_at, ends_at, owner_id, price_per_photo, expires_at, updated_at)
     VALUES (gen_random_uuid(), 'e', 'E', now(), now(), $1, 1000, now() + interval '180 days', now()) RETURNING id`,
    [userId],
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('schema', () => {
  it('puts face data in the biometric schema only', async () => {
    const { rows } = await db.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM information_schema.tables
       WHERE table_name IN ('face_embedding', 'search_session') ORDER BY table_name`,
    );
    expect(rows).toEqual([
      { table_schema: 'biometric', table_name: 'face_embedding' },
      { table_schema: 'biometric', table_name: 'search_session' },
    ]);
  });
});

describe('db roles', () => {
  it('denies the admin role any access to biometric data', async () => {
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT
        has_schema_privilege('pic_admin_role', 'biometric', 'USAGE')                     AS admin_schema,
        has_table_privilege('pic_admin_role', 'biometric.face_embedding', 'SELECT')      AS admin_faces,
        has_table_privilege('pic_admin_role', 'biometric.search_session', 'SELECT')      AS admin_sessions,
        has_schema_privilege('pic_app_role', 'biometric', 'USAGE')                       AS app_schema,
        has_table_privilege('pic_app_role', 'biometric.face_embedding', 'SELECT,INSERT') AS app_faces,
        has_table_privilege('pic_admin_role', 'public.photo', 'SELECT,UPDATE')           AS admin_photos
    `);
    expect(rows[0]).toEqual({
      admin_schema: false,
      admin_faces: false,
      admin_sessions: false,
      app_schema: true,
      app_faces: true,
      admin_photos: true,
    });
  });

  it('lets runtime roles insert into the audit log but never change it', async () => {
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT
        has_table_privilege('pic_admin_role', 'public.audit_log', 'INSERT') AS admin_insert,
        has_table_privilege('pic_admin_role', 'public.audit_log', 'UPDATE') AS admin_update,
        has_table_privilege('pic_admin_role', 'public.audit_log', 'DELETE') AS admin_delete,
        has_table_privilege('pic_app_role',   'public.audit_log', 'UPDATE') AS app_update
    `);
    expect(rows[0]).toEqual({ admin_insert: true, admin_update: false, admin_delete: false, app_update: false });
  });
});

describe('guards', () => {
  it('blocks UPDATE and DELETE on audit_log even for the owner', async () => {
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id)
       VALUES ($1, 'ADMIN', 'test', 'x', '1')`,
      [userId],
    );
    await expect(db.query(`UPDATE audit_log SET action = 'tampered'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
  });

  it('rejects search sessions that would live longer than 24h', async () => {
    const insertSession = (ttl: string) =>
      db.query(
        `INSERT INTO biometric.search_session (id, event_id, consent_version, model_version, expires_at)
         VALUES (gen_random_uuid(), $1, 'test', 'test', now() + $2::interval)`,
        [eventId, ttl],
      );
    await expect(insertSession('25 hours')).rejects.toThrow(/search_session_ttl_max_24h/);
    await expect(insertSession('24 hours')).resolves.toBeDefined();
  });

  it('rejects order items whose revenue split does not sum to the price', async () => {
    const orderId = await insertReturningId(
      `INSERT INTO "order" (id, event_title_snap, total_amount, access_token_hash, updated_at)
       VALUES (gen_random_uuid(), 'E', 1000, 'h', now()) RETURNING id`,
    );
    const insertItem = (photographerAmount: number, platformAmount: number) =>
      db.query(
        `INSERT INTO order_item (id, order_id, photo_filename_snap, photographer_id, price,
           photographer_share_pct, photographer_amount, platform_amount)
         VALUES (gen_random_uuid(), $1, 'a.jpg', $2, 1000, 70, $3, $4)`,
        [orderId, userId, photographerAmount, platformAmount],
      );
    await expect(insertItem(700, 200)).rejects.toThrow(/order_item_amounts_valid/);
    await expect(insertItem(700, 300)).resolves.toBeDefined();
  });

  it('rejects uppercase emails', async () => {
    await expect(
      db.query(
        `INSERT INTO "user" (id, email, password_hash, role, display_name, updated_at)
         VALUES (gen_random_uuid(), 'Upper@pic.local', 'x', 'ADMIN', 'U', now())`,
      ),
    ).rejects.toThrow(/user_email_lowercase/);
  });

  it('requires an access token for unlisted events', async () => {
    await expect(
      db.query(
        `INSERT INTO event (id, slug, title, starts_at, ends_at, owner_id, visibility, price_per_photo, expires_at, updated_at)
         VALUES (gen_random_uuid(), 'u', 'U', now(), now(), $1, 'UNLISTED', 1000, now(), now())`,
        [userId],
      ),
    ).rejects.toThrow(/event_unlisted_has_token/);
  });
});

describe('orders and password reset (Phase 5)', () => {
  it('stores an encrypted order link only for orders with a contact email', async () => {
    const insertOrder = (email: string | null) =>
      db.query(
        `INSERT INTO "order" (id, event_title_snap, total_amount, access_token_hash, contact_email, access_token_enc, updated_at)
         VALUES (gen_random_uuid(), 'E', 1000, 'h', $1, 'v1.enc', now())`,
        [email],
      );
    await expect(insertOrder(null)).rejects.toThrow(/order_token_enc_requires_email/);
    await expect(insertOrder('buyer@pic.local')).resolves.toBeDefined();
  });

  it('keeps password reset tokens short-lived', async () => {
    const insertToken = (ttl: string) =>
      db.query(
        `INSERT INTO password_reset_token (id, user_id, token_hash, expires_at)
         VALUES (gen_random_uuid(), $1, gen_random_uuid()::text, now() + $2::interval)`,
        [userId, ttl],
      );
    await expect(insertToken('2 hours')).rejects.toThrow(/password_reset_token_short_lived/);
    await expect(insertToken('30 minutes')).resolves.toBeDefined();
  });

  it('hides password reset tokens from the admin role', async () => {
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT
        has_table_privilege('pic_admin_role', 'public.password_reset_token', 'SELECT') AS admin_select,
        has_table_privilege('pic_app_role', 'public.password_reset_token', 'SELECT,INSERT,UPDATE,DELETE') AS app_all
    `);
    expect(rows[0]).toEqual({ admin_select: false, app_all: true });
  });
});

describe('face embeddings', () => {
  it('stores SFace-sized (128-dim) vectors only', async () => {
    const photo = await insertPhoto();
    const wrongSize = `[${Array.from({ length: 512 }, () => 0.01).join(',')}]`;
    await expect(
      db.query(
        `INSERT INTO biometric.face_embedding
           (id, photo_id, event_id, embedding, bbox, det_score, face_size_px, quality, model_version)
         VALUES (gen_random_uuid(), $1, $2, $3::vector, '{}', 0.9, 80, 0.8, 'test')`,
        [photo, eventId, wrongSize],
      ),
    ).rejects.toThrow(/dimensions/);
    await db.query(`DELETE FROM photo WHERE id = $1`, [photo]);
  });

  it('ranks by cosine similarity within an event and cascades on photo delete', async () => {
    const photoA = await insertPhoto();
    const photoB = await insertPhoto();
    const insertFace = (photoId: string, axis: number) =>
      db.query(
        `INSERT INTO biometric.face_embedding
           (id, photo_id, event_id, embedding, bbox, det_score, face_size_px, quality, model_version)
         VALUES (gen_random_uuid(), $1, $2, $3::vector, '{}', 0.9, 80, 0.8, 'test')`,
        [photoId, eventId, unitVector(axis)],
      );
    await insertFace(photoA, 0);
    await insertFace(photoB, 1);

    // Phase 4-ийн хайлтын query-тэй ижил хэлбэр: event-ээр шүүгээд exact cosine
    const { rows } = await db.query<{ photo_id: string; score: number }>(
      `SELECT photo_id, MAX(1 - (embedding <=> $1::vector)) AS score
       FROM biometric.face_embedding
       WHERE event_id = $2 AND model_version = 'test' AND face_size_px >= 32
       GROUP BY photo_id ORDER BY score DESC`,
      [unitVector(0), eventId],
    );
    expect(rows.map((r) => r.photo_id)).toEqual([photoA, photoB]);
    expect(rows[0]!.score).toBeCloseTo(1, 5);
    expect(rows[1]!.score).toBeCloseTo(0, 5);

    await db.query(`DELETE FROM photo WHERE id = $1`, [photoA]);
    const { rows: left } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM biometric.face_embedding WHERE photo_id = $1`,
      [photoA],
    );
    expect(left[0]!.n).toBe(0);
  });
});
