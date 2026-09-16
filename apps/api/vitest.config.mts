import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest-ийн decorator metadata-г (emitDecoratorMetadata) esbuild дэмждэггүй тул SWC-ээр хөрвүүлнэ.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
