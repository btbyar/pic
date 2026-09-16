import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

/**
 * Prisma 7 client (Rust engine-гүй, pg driver adapter-тай).
 * API нь APP_DATABASE_URL, админ модуль ADMIN_DATABASE_URL-ээр тус тусдаа client үүсгэнэ.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
