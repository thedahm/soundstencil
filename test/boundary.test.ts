import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// DOM globals are already a type error in src/core (tsconfig.core.json has no
// DOM lib). This guards the other direction: core never reaches into the UI.
describe('src/core', () => {
  const dir = new URL('../src/core/', import.meta.url);
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.ts'),
  );

  it('has modules', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s does not import from src/ui', (file) => {
    const source = readFileSync(new URL(file, dir), 'utf8');
    const specifiers = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/(^|\/)ui(\/|$)/);
    }
  });
});
