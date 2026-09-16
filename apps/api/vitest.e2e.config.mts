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
  },
});
