// The pure pipeline: samples → Selection → Buckets → shapes → SVG.
// No DOM, no browser APIs (enforced by tsconfig.core.json). Everything here is
// plain data in, plain data out, and tested with Vitest.

export const APP_NAME = 'soundstencil';
