import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FFMPEG_CORE_URL } from '../src/core/ffmpeg';

// The CSP stops requests to other origins at runtime. This catches the code
// that would try: the Source is read locally and never sent anywhere, including
// to 'self'. The one exception is the ffmpeg fallback's pinned codec download
// (ADR-0001), which @ffmpeg/util makes, and only from FFMPEG_CORE_URL.
describe('src/', () => {
  const dir = new URL('../src/', import.meta.url);
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.ts'),
  );
  const read = (file: string) => readFileSync(new URL(file, dir), 'utf8');

  it.each(files)('%s makes no network calls', (file) => {
    expect(read(file)).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/);
  });

  it('names no other origin than the pinned ffmpeg core', () => {
    const urls = files
      .flatMap((file) => read(file).match(/https?:\/\/[^\s'"`]+/g) ?? [])
      // XML namespaces are names, never requested.
      .filter((url) => !url.startsWith('http://www.w3.org/'));
    expect(urls).toEqual([FFMPEG_CORE_URL]);
  });
});
