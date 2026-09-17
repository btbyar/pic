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
    // Локал .env-д 2FA унтраасан байсан ч тест production-ийн дүрмийг шалгана.
    // Тусдаа queue угтвар: асаалттай dev worker тестийн job-ыг булааж авахгүй.
    env: { ADMIN_MFA_REQUIRED: 'true', QUEUE_PREFIX: 'pic-e2e' },
  },
});
