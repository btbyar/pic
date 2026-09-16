import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Ажиллаж буй infra шаардана: `docker compose up -d && pnpm db:deploy`
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    // Локал .env-д 2FA унтраасан байсан ч тест production-ийн дүрмийг шалгана
    env: { ADMIN_MFA_REQUIRED: 'true' },
  },
});
