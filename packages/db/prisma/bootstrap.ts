// Production bootstrap — migration-ы дараа deploy бүрт ажиллана, олон удаа ажиллуулахад аюулгүй.
// 1) pic_app / pic_admin login хэрэглэгч (migration зөвхөн NOLOGIN group role үүсгэдэг)
// 2) Админ нэг ч байхгүй бол BOOTSTRAP_ADMIN_* -ээр анхны админыг үүсгэнэ (TOTP-г анх нэвтрэхдээ бүртгүүлнэ)
import { hash } from '@node-rs/argon2';
import { config } from 'dotenv';
import pg from 'pg';
import { createPrismaClient } from '../src/index.js';

config({ path: ['.env', '../../.env'], quiet: true });

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`${name} must be set (min length ${minLength})`);
  }
  return value;
}

async function ensureLoginRoles(databaseUrl: string) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const [login, group, password] of [
      ['pic_app', 'pic_app_role', requireEnv('PIC_APP_DB_PASSWORD', 16)],
      ['pic_admin', 'pic_admin_role', requireEnv('PIC_ADMIN_DB_PASSWORD', 16)],
    ] as const) {
      const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [login]);
      const pw = client.escapeLiteral(password);
      // Нууц үг env-ээс солигдсон бол дагаж шинэчлэгдэнэ
      await client.query(
        rowCount ? `ALTER ROLE ${login} WITH LOGIN PASSWORD ${pw}` : `CREATE ROLE ${login} LOGIN PASSWORD ${pw} IN ROLE ${group}`,
      );
      console.log(`${login}: ${rowCount ? 'updated' : 'created'}`);
    }
  } finally {
    await client.end();
  }
}

async function ensureAdmin(databaseUrl: string) {
  const prisma = createPrismaClient(databaseUrl);
  try {
    if (await prisma.user.count({ where: { role: 'ADMIN' } })) {
      console.log('admin: exists');
      return;
    }
    const email = requireEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
    const passwordHash = await hash(requireEnv('BOOTSTRAP_ADMIN_PASSWORD', 12), {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await prisma.user.create({
      data: { email, passwordHash, role: 'ADMIN', status: 'APPROVED', displayName: 'Систем админ' },
    });
    console.log(`admin: created ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

const databaseUrl = requireEnv('DATABASE_URL');
await ensureLoginRoles(databaseUrl);
await ensureAdmin(databaseUrl);
