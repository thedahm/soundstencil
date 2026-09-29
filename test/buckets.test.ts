import { describe, expect, it } from 'vitest';
import { buckets, compress } from '../src/core/buckets';

const SIZE = { widthMm: 80, heightMm: 25 };

describe('compress', () => {
  it('scales so the loudest Bucket reaches max height', () => {
    const heights = compress(Float32Array.from([0.5, 0.25]), SIZE, { gamma: 1, floorMm: 0 });
    expect(heights).toEqual([25, 12.5]);
  });

  it('applies h = v^γ to loudness relative to the loudest, default γ 0.6', () => {
    // 0.25^0.6 = 0.4353, 0.25^0.3 = 0.6598
    expect(compress(Float32Array.from([1, 0.25]), SIZE, { floorMm: 0 })[1]).toBeCloseTo(10.88, 2);
    expect(compress(Float32Array.from([1, 0.25]), SIZE, { gamma: 0.3, floorMm: 0 })[1]).toBeCloseTo(
      16.49,
      2,
    );
  });

  it('keeps γ within 0.3 to 1.0', () => {
    const at = (gamma: number) => compress(Float32Array.from([1, 0.25]), SIZE, { gamma, floorMm: 0 })[1];
    expect(at(0.1)).toBeCloseTo(at(0.3)!);
    expect(at(2)).toBeCloseTo(at(1)!);
  });

  it('lifts quiet Buckets to the floor, default 1.0 mm', () => {
    expect(compress(Float32Array.from([1, 0.001, 0]), SIZE)).toEqual([25, 1, 1]);
    expect(compress(Float32Array.from([1, 0]), SIZE, { floorMm: 2 })[1]).toBe(2);
  });

  it('draws a silent Selection as all floor', () => {
    expect(compress(new Float32Array(3), SIZE)).toEqual([1, 1, 1]);
  });

  it('never lets the floor exceed max height', () => {
    expect(compress(Float32Array.from([1, 0]), { widthMm: 80, heightMm: 3 }, { floorMm: 5 })).toEqual([
      3, 3,
    ]);
  });
});

describe('buckets', () => {
  it('splits the Selection into N equal slices, each reduced to its peak by default', () => {
    // Thirty slices of 2 samples; the sign of a sample never matters.
    const samples = new Float32Array(60);
    samples.set([0.1, -0.5, 0, 0, 0.9, 0.3]);
    const result = buckets(samples, { start: 0, end: 60 }, { count: 30 });
    expect(result).toHaveLength(30);
    expect(Array.from(result.slice(0, 4))).toEqual([0.5, 0, 0.9, 0].map(Math.fround));
  });

  it('reduces to RMS when asked', () => {
    const samples = new Float32Array(60);
    samples.set([0.5, -0.5, 0.6, 0.8]);
    const rms = buckets(samples, { start: 0, end: 60 }, { count: 30, reduction: 'rms' });
    expect(rms[0]).toBeCloseTo(0.5);
    expect(rms[1]).toBeCloseTo(Math.sqrt(0.5)); // sqrt((0.36 + 0.64) / 2)
  });

  it('reads only the Selection', () => {
    // Loud outside, 0.2 then 0.4 inside, one sample per Bucket.
    const samples = new Float32Array(100).fill(1);
    samples.fill(0.2, 10, 25);
    samples.fill(0.4, 25, 40);
    const result = buckets(samples, { start: 10, end: 40 }, { count: 2 });
    expect(Math.max(...result)).toBeCloseTo(0.4);
    expect(result[0]).toBeCloseTo(0.2);
    expect(result.at(-1)).toBeCloseTo(0.4);
  });

  it('defaults to 48 Buckets', () => {
    expect(buckets(new Float32Array(1000), { start: 0, end: 1000 })).toHaveLength(48);
  });

  it('keeps N within 30 to 80', () => {
    const samples = new Float32Array(1000);
    expect(buckets(samples, { start: 0, end: 1000 }, { count: 5 })).toHaveLength(30);
    expect(buckets(samples, { start: 0, end: 1000 }, { count: 200 })).toHaveLength(80);
  });

  it('still gives N Buckets from a Selection shorter than N samples', () => {
    const samples = Float32Array.from({ length: 10 }, (_, i) => i / 10);
    const result = buckets(samples, { start: 0, end: 10 }, { count: 30 });
    expect(result).toHaveLength(30);
    expect(result.every((v) => Number.isFinite(v))).toBe(true);
    expect(Math.max(...result)).toBeCloseTo(0.9);
  });
});
