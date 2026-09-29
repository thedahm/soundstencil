import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tighten } from '../src/core/selection';
import { decodeSource } from '../src/core/source';
import { barsStencil, lineStencil, stencil } from '../src/core/stencil';
import { thinSpots } from '../src/core/thin-spots';
import { area, isSimple } from './fixtures/polygon';
import { wavDecoder } from './fixtures/wav';

const bark = async () => {
  const file = readFileSync(new URL('./fixtures/bark.wav', import.meta.url));
  const source = await decodeSource(
    async () => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
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

/** The numbers in an SVG path, as [x, y] pairs. */
const coordinates = (d: string) =>
  [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

describe('lineStencil', () => {
  it('draws the tightened bark at defaults as one filled outline, 80 × 25 mm', async () => {
    const { samples, selection } = await bark();
    const { svg, fileName, thicknessMm } = lineStencil(samples, selection);
    expect(thicknessMm).toBe(1.2);
    expect(fileName).toBe('soundstencil-line-80x25mm.svg');
    const paths = [...svg.matchAll(/<path fill="#000" d="([^"]*)"\/>/g)];
    expect(paths).toHaveLength(1);
    expect(svg).not.toMatch(/stroke/);
    expect(svg).toMatch(/width="80mm" height="25mm" viewBox="0 0 80 25"/);
    const d = paths[0]![1]!;
    expect(d.match(/M/g)).toHaveLength(1);
    const points = coordinates(d);
    // Still simple once rounded to 0.01 mm.
    expect(isSimple(points.map(([x, y]) => ({ x, y })))).toBe(true);
    expect(Math.min(...points.map(([x]) => x))).toBe(0);
    expect(Math.max(...points.map(([x]) => x))).toBe(80);
    // The loudest Bucket reaches max height on one side.
    const ys = points.map(([, y]) => y);
    expect(Math.min(...ys) === 0 || Math.max(...ys) === 25).toBe(true);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(25);
    await expect(svg).toMatchFileSnapshot('./__snapshots__/line-default.svg');
  });

  it('exports the centerline as an Editable SVG on the same canvas', async () => {
    const { samples, selection } = await bark();
    const { editable } = lineStencil(samples, selection);
    expect(editable.fileName).toBe('soundstencil-line-editable-80x25mm.svg');
    expect(editable.svg).toMatch(/width="80mm" height="25mm" viewBox="0 0 80 25"/);
    expect(editable.svg).toMatch(/fill="none" stroke="#000" stroke-width="1.2"/);
    expect(editable.svg).toMatch(/stroke-linecap="round" stroke-linejoin="round"/);
    await expect(editable.svg).toMatchFileSnapshot('./__snapshots__/line-editable-default.svg');
  });

  it('passes the Line controls and shared controls through', async () => {
    const { samples, selection } = await bark();
    const design = { count: 30, thicknessMm: 2, smoothing: 0, printSize: { widthMm: 100, heightMm: 40 } };
    const { svg, editable, thicknessMm } = lineStencil(samples, selection, design);
    expect(thicknessMm).toBe(2);
    expect(svg).toMatch(/viewBox="0 0 100 40"/);
    // Smoothing 0: every control point sits on an anchor, so 30 Buckets + lead-out.
    expect(editable.svg).toMatch(/stroke-width="2"/);
    expect(editable.svg.match(/C/g)).toHaveLength(31);
  });
});

describe('Thin Spots in a Stencil', () => {
  it('finds the gap between each pair of bars at defaults: 0.67 mm, under 1 mm', async () => {
    const { samples, selection } = await bark();
    const spots = thinSpots(barsStencil(samples, selection).ink);
    expect(spots).toHaveLength(47);
    expect(spots.every((s) => s.kind === 'gap')).toBe(true);
  });

  it('finds none in bars with wider gaps', async () => {
    const { samples, selection } = await bark();
    const { ink } = barsStencil(samples, selection, { count: 30, fillRatio: 0.3, printSize: { widthMm: 100, heightMm: 25 } });
    expect(thinSpots(ink)).toEqual([]);
  });

  it('finds a whole Line thinner than the threshold', async () => {
    const { samples, selection } = await bark();
    const spots = thinSpots(lineStencil(samples, selection, { thicknessMm: 0.5 }).ink);
    expect(spots.length).toBeGreaterThan(0);
    const inked = spots.filter((s) => s.kind === 'ink');
    // At least the 80 mm the line runs across, 0.5 mm wide.
    expect(inked.reduce((sum, s) => sum + s.areaMm2, 0)).toBeGreaterThan(40);
  });
});

describe('stencil', () => {
  it('draws the Line Style by default', async () => {
    const { samples, selection } = await bark();
    expect(stencil(samples, selection).style).toBe('line');
  });

  it('draws Bars when asked, with the same shared controls', async () => {
    const { samples, selection } = await bark();
    const bars = stencil(samples, selection, { style: 'bars', count: 30 });
    expect(bars.style).toBe('bars');
    expect(bars.style === 'bars' && bars.geometry.bars).toHaveLength(30);
  });
});
