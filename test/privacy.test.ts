import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The CSP stops requests to other origins at runtime. This catches the code
// that would try: the Source is read locally and never sent anywhere, including
// to 'self'. The ffmpeg slice's one pinned codec fetch will be the exception.
describe('src/', () => {
  const dir = new URL('../src/', import.meta.url);
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.ts'),
  );

  it.each(files)('%s makes no network calls', (file) => {
    const source = readFileSync(new URL(file, dir), 'utf8');
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/);
  });
});
