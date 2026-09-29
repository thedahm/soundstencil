import { describe, expect, it } from 'vitest';
import { bars } from '../src/core/bars';

const SIZE = { widthMm: 10, heightMm: 25 };

describe('bars', () => {
  it('spans the Print Size width exactly, bar width ÷ pitch = fill ratio', () => {
    // 3 bars at 50%: bar, gap, bar, gap, bar = 5 equal parts of 2 mm.
    const { barWidthMm, gapMm, bars: shapes } = bars([25, 10, 1], SIZE, { fillRatio: 0.5 });
    expect(barWidthMm).toBeCloseTo(2);
    expect(gapMm).toBeCloseTo(2);
    expect(shapes.map((b) => b.x)).toEqual([0, 4, 8]);
    expect(shapes.at(-1)!.x + shapes.at(-1)!.width).toBeCloseTo(10);
  });

  it('mirrors each bar about the middle of max height', () => {
    const { bars: shapes } = bars([25, 10, 1], SIZE, { fillRatio: 0.5 });
    expect(shapes.map((b) => [b.y, b.height])).toEqual([
      [0, 25],
      [7.5, 10],
      [12, 1],
    ]);
  });

  it('defaults to 60% fill, exposing bar width and gap in mm', () => {
    // 48 bars over 80 mm: pitch 80 / 47.6 = 1.6807 mm.
    const { barWidthMm, gapMm } = bars(new Array(48).fill(5), { widthMm: 80, heightMm: 25 });
    expect(barWidthMm).toBeCloseTo(1.0084, 4);
    expect(gapMm).toBeCloseTo(0.6723, 4);
  });

  it('rounds to a full pill by default, never past half the shorter side', () => {
    const { bars: shapes } = bars([25, 1], SIZE, { fillRatio: 0.5 });
    // 2 bars at 50%: 10 / 1.5 pitch, bar width 3.33 mm.
    expect(shapes[0]!.radius).toBeCloseTo(10 / 6);
    expect(shapes[1]!.radius).toBeCloseTo(0.5);
  });

  it('scales rounding from square corners (0) to a full pill (1)', () => {
    const radius = (rounding: number) => bars([25, 25], SIZE, { fillRatio: 0.5, rounding }).bars[0]!.radius;
    expect(radius(0)).toBe(0);
    expect(radius(0.5)).toBeCloseTo(10 / 12);
  });
});
