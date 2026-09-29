// The Bars Style: one mirrored, rounded bar per Bucket.
import type { PrintSize } from './print-size';

export const MIN_FILL_RATIO = 0.1;
export const MAX_FILL_RATIO = 0.9;
export const DEFAULT_FILL_RATIO = 0.6;
/** Full pill. */
export const DEFAULT_ROUNDING = 1;

export interface BarsOptions {
  /** Bar width ÷ pitch, clamped to MIN_FILL_RATIO..MAX_FILL_RATIO. */
  fillRatio?: number;
  /** Corner radius from 0 (square) to 1 (full pill: half the bar's shorter side). */
  rounding?: number;
}

/** A rounded rectangle, all in mm with the origin top left. */
export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface BarsGeometry {
  bars: Bar[];
  /** Shown to the user, not set: they follow from N, width, and fill ratio. */
  barWidthMm: number;
  gapMm: number;
}

/**
 * Lay one bar per Bucket height across the Print Size width, first bar's left
 * edge at 0 and last bar's right edge at the full width, each centred on the
 * middle of max height.
 */
export function bars(
  heightsMm: readonly number[],
  { widthMm, heightMm }: PrintSize,
  { fillRatio = DEFAULT_FILL_RATIO, rounding = DEFAULT_ROUNDING }: BarsOptions = {},
): BarsGeometry {
  const fill = Math.min(MAX_FILL_RATIO, Math.max(MIN_FILL_RATIO, fillRatio));
  const round = Math.min(1, Math.max(0, rounding));
  const n = heightsMm.length;
  // n bars and n - 1 gaps fill the width: n·pitch − gap = width.
  const pitch = n > 0 ? widthMm / (n - 1 + fill) : 0;
  const width = pitch * fill;
  return {
    barWidthMm: width,
    gapMm: pitch - width,
    bars: heightsMm.map((height, i) => ({
      x: i * pitch,
      y: (heightMm - height) / 2,
      width,
      height,
      radius: (round * Math.min(width, height)) / 2,
    })),
  };
}
