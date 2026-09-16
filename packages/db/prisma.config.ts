import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// packages/db-ээс ажиллахад монорепогийн root .env-ийг уншина
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
