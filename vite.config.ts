import { defineConfig } from 'vite';

export default defineConfig({
  // ffmpeg.wasm starts its worker from a file beside the wrapper; the dev
  // server's dependency pre-bundling would move the wrapper away from it.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  // e2e/ is Playwright's.
  test: { include: ['test/**/*.test.ts'] },
});
