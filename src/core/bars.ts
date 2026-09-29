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

/** How far a flattened corner may stray from its arc, in mm. */
const ARC_TOLERANCE_MM = 0.01;

/**
 * A bar as a polygon, its rounded corners flattened to within
 * ARC_TOLERANCE_MM, clockwise on screen from the top-left corner's arc.
 */
export function barPolygon({ x, y, width, height, radius: r }: Bar): { x: number; y: number }[] {
  if (r <= 0) {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }
  const steps = Math.max(1, Math.ceil(Math.PI / 2 / (2 * Math.acos(Math.max(-1, 1 - ARC_TOLERANCE_MM / r)))));
  // Corner centres, each with the angle its quarter arc starts at (y down).
  const corners = [
    [x + width - r, y + r, -Math.PI / 2],
    [x + width - r, y + height - r, 0],
    [x + r, y + height - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ] as const;
  return corners.flatMap(([cx, cy, from]) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const angle = from + (i / steps) * (Math.PI / 2);
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    }),
  );
}
