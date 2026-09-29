import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tighten } from '../src/core/selection';
import { decodeSource } from '../src/core/source';
import { barsStencil } from '../src/core/stencil';
import { wavDecoder } from './fixtures/wav';

const bark = async () => {
  const file = readFileSync(new URL('./fixtures/bark.wav', import.meta.url));
  const source = await decodeSource(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    [wavDecoder],
  );
  const selection = tighten(source.samples, source.sampleRate, {
    start: 0,
    end: source.samples.length,
  });
  return { samples: source.samples, selection };
};

describe('barsStencil', () => {
  it('draws the tightened bark at defaults: 48 bars, 80 × 25 mm, loudest at max height', async () => {
    const { samples, selection } = await bark();
    const { geometry, svg, fileName } = barsStencil(samples, selection);
    expect(geometry.bars).toHaveLength(48);
    expect(Math.max(...geometry.bars.map((b) => b.height))).toBe(25);
    expect(Math.min(...geometry.bars.map((b) => b.height))).toBeGreaterThanOrEqual(1);
    expect(fileName).toBe('soundstencil-bars-80x25mm.svg');
    await expect(svg).toMatchFileSnapshot('./__snapshots__/bars-default.svg');
  });

  it('passes every control through', async () => {
    const { samples, selection } = await bark();
    const { geometry, svg, fileName } = barsStencil(samples, selection, {
      count: 30,
      reduction: 'rms',
      gamma: 1,
      floorMm: 2,
      fillRatio: 0.5,
      rounding: 0,
      printSize: { widthMm: 100, heightMm: 40 },
    });
    expect(geometry.bars).toHaveLength(30);
    expect(geometry.barWidthMm).toBeCloseTo(100 / 29.5 / 2);
    expect(Math.max(...geometry.bars.map((b) => b.height))).toBe(40);
    expect(Math.min(...geometry.bars.map((b) => b.height))).toBe(2);
    expect(svg).not.toContain('A');
    expect(fileName).toBe('soundstencil-bars-100x40mm.svg');
  });
});
