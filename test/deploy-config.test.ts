import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Header block for one path pattern in a Cloudflare `_headers` file. */
function headersFor(file: string, pattern: string): Map<string, string> {
  const headers = new Map<string, string>();
  let inBlock = false;
  for (const line of file.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === pattern;
      continue;
    }
    if (!inBlock) continue;
    const i = line.indexOf(':');
    headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return headers;
}

function parseCsp(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]) => [name!, sources]),
  );
}

describe('public/_headers', () => {
  const headers = headersFor(read('public/_headers'), '/*');
  const csp = parseCsp(headers.get('content-security-policy') ?? '');

  it('sets a CSP on every path', () => {
    expect(headers.has('content-security-policy')).toBe(true);
  });

  it("defaults every fetch to 'self'", () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
  });

  it("allows nothing beyond 'self', blob:, and 'wasm-unsafe-eval'", () => {
    const allowed = new Set(["'self'", "'none'", 'blob:', "'wasm-unsafe-eval'"]);
    for (const [directive, sources] of csp) {
      for (const source of sources) {
        expect(allowed, `${directive} ${source}`).toContain(source);
      }
    }
  });

  it('permits wasm compilation for scripts and blob: for decoded media', () => {
    expect(csp.get('script-src')).toContain("'wasm-unsafe-eval'");
    expect(csp.get('media-src')).toContain('blob:');
  });

  it('blocks framing, plugins, and base/form hijacking', () => {
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'none'"]);
  });

  it('sends no referrer', () => {
    expect(headers.get('referrer-policy')).toBe('no-referrer');
  });
});

describe('wrangler.jsonc', () => {
  const config = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));

  it('serves static assets from dist/ with no Worker script', () => {
    expect(config.main).toBeUndefined();
    expect(config.assets.directory).toBe('./dist/');
  });

  it('is reachable only at the custom domain', () => {
    expect(config.workers_dev).toBe(false);
    expect(config.routes).toEqual([
      { pattern: 'soundstencil.dominichanzely.com', custom_domain: true },
    ]);
  });
});
