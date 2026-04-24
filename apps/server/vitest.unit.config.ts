import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Pure-logic tests only — no Redis testcontainer, no ffmpeg.
 * Used by `npm run test:unit`. The full `test:app` suite (which requires a
 * container runtime + ffmpeg on the host) still runs in CI via the original
 * vitest.config.ts.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.unit.test.ts']
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@worker': path.resolve(__dirname, '../worker/src')
    }
  }
});
