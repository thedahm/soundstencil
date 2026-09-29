// The Line Style: a smoothed curve through Bucket loudness with alternating
// sign, the "heartbeat" oscillation, offset into a filled outline (ADR-0002).
import { Clipper, ClipperOffset, EndType, JoinType, Paths64, Point64 } from 'clipper2-js';
import type { PrintSize } from './print-size';

export const MIN_THICKNESS_MM = 0.3;
export const MAX_THICKNESS_MM = 5;
export const DEFAULT_THICKNESS_MM = 1.2;
export const DEFAULT_SMOOTHING = 0.8;

export interface LineOptions {
  /** Stroke thickness at Print Size, clamped to MIN..MAX_THICKNESS_MM and the max height. */
  thicknessMm?: number;
  /** From 0 (straight segments) to 1 (a full Catmull-Rom spline). */
  smoothing?: number;
}

/** In mm with the origin top left. */
export interface Point {
  x: number;
  y: number;
}

/** A cubic Bézier from the previous segment's end (or the curve's start). */
export interface Segment {
  c1: Point;
  c2: Point;
  to: Point;
}

export interface Curve {
  start: Point;
  segments: Segment[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The thickness actually drawn: in range, and no taller than the design. */
export const lineThickness = ({ heightMm }: PrintSize, thicknessMm = DEFAULT_THICKNESS_MM) =>
  Math.min(heightMm, clamp(thicknessMm, MIN_THICKNESS_MM, MAX_THICKNESS_MM));

/**
 * The centerline through one anchor per Bucket, centred in equal slices of the
 * width and swinging above then below the middle by half its height. It starts
 * and ends on the middle. Everything is inset by half the thickness, so the
 * stroke's outer edge (round caps included) meets the Print Size and the
 * loudest Bucket's edge reaches max height.
 *
 * Each span is a cubic Bézier: the Catmull-Rom tangents scaled by smoothing.
 * Control points are clamped into the inset box, and a Bézier stays inside its
 * control points, so an overshooting tangent never pushes the curve out.
 */
export function centerline(
  heightsMm: readonly number[],
  printSize: PrintSize,
  { thicknessMm, smoothing = DEFAULT_SMOOTHING }: LineOptions = {},
): Curve {
  const { widthMm, heightMm } = printSize;
  const t = lineThickness(printSize, thicknessMm);
  const s = clamp(smoothing, 0, 1);
  const inset = t / 2;
  const [left, right, top, bottom] = [inset, widthMm - inset, inset, heightMm - inset];
  const mid = heightMm / 2;
  const scale = (heightMm - t) / heightMm;
  const n = heightsMm.length;
  const anchors: Point[] = [
    { x: left, y: mid },
    ...heightsMm.map((h, i) => ({
      x: left + ((i + 0.5) / n) * (right - left),
      y: mid + (i % 2 ? 1 : -1) * (h / 2) * scale,
    })),
    { x: right, y: mid },
  ];
  const inside = ({ x, y }: Point): Point => ({ x: clamp(x, left, right), y: clamp(y, top, bottom) });
  const segments = anchors.slice(1).map((to, i): Segment => {
    const from = anchors[i]!;
    const before = anchors[i - 1] ?? from;
    const after = anchors[i + 2] ?? to;
    return {
      c1: inside({ x: from.x + (s * (to.x - before.x)) / 6, y: from.y + (s * (to.y - before.y)) / 6 }),
      c2: inside({ x: to.x - (s * (after.x - from.x)) / 6, y: to.y - (s * (after.y - from.y)) / 6 }),
      to,
    };
  });
  return { start: anchors[0]!, segments };
}

/** How far the flattened polyline may stray from the curve, in mm. */
export const FLATNESS_MM = 0.01;

/**
 * The curve as a polyline through its start and every anchor, never more than
 * FLATNESS_MM from the curve: dense where it bends, sparse where it runs
 * straight. Each Bézier is halved until its control points lie that close to
 * its chord, which bounds the whole span's distance from the chord.
 */
export function flatten({ start, segments }: Curve): Point[] {
  const points = [start];
  let from = start;
  for (const { c1, c2, to } of segments) {
    subdivide(from, c1, c2, to, points, 0);
    from = to;
  }
  return points;
}

/** Deep enough for any curve at Print Size; stops runaway recursion on NaN. */
const MAX_DEPTH = 16;

function subdivide(p0: Point, p1: Point, p2: Point, p3: Point, out: Point[], depth: number) {
  if (depth >= MAX_DEPTH || (fromChord(p1, p0, p3) <= FLATNESS_MM && fromChord(p2, p0, p3) <= FLATNESS_MM)) {
    out.push(p3);
    return;
  }
  // de Casteljau at t = ½.
  const [a, b, c] = [half(p0, p1), half(p1, p2), half(p2, p3)];
  const [d, e] = [half(a, b), half(b, c)];
  const m = half(d, e);
  subdivide(p0, a, d, m, out, depth + 1);
  subdivide(m, e, c, p3, out, depth + 1);
}

const half = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Distance from p to the segment ab. */
function fromChord(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Clipper works on integers: 1 unit is 1 µm. */
const UNITS_PER_MM = 1000;
/** How far a round join or cap may stray from a true arc, in mm. */
const ARC_TOLERANCE_MM = 0.01;
/** Vertices this close to the line through their neighbours are dropped, in mm. */
const SIMPLIFY_MM = 0.002;

/**
 * The polyline offset to a filled outline `thicknessMm` wide, with round joins
 * and round caps. Clipper unions the result, so however sharply the line turns,
 * it comes back as simple polygons: one, for any line that doesn't cross itself.
 *
 * Each segment is offset on its own, as a round-capped capsule, and Clipper
 * unions the lot. That is the same shape as offsetting the whole polyline with
 * round joins (both are every point within half the thickness of the line),
 * but this port gets whole-polyline offsets wrong at sharp concave turns: it
 * winds part of the stroke negatively, and the union drops it, leaving holes
 * or splitting the outline at the spikes.
 */
export function outline(polyline: readonly Point[], thicknessMm: number): Point[][] {
  const offset = new ClipperOffset(2, ARC_TOLERANCE_MM * UNITS_PER_MM);
  const points = polyline.map(
    ({ x, y }) => new Point64(Math.round(x * UNITS_PER_MM), Math.round(y * UNITS_PER_MM)),
  );
  const segments = new Paths64();
  for (let i = 1; i < points.length; i++) segments.push([points[i - 1]!, points[i]!]);
  // A single point still draws a dot.
  if (points.length === 1) segments.push([points[0]!, points[0]!]);
  offset.addPaths(segments, JoinType.Round, EndType.Round);
  const solution = new Paths64();
  // For open paths this port offsets by half of delta each side, so delta is the full width.
  offset.execute(thicknessMm * UNITS_PER_MM, solution);
  return Clipper.simplifyPaths(solution, SIMPLIFY_MM * UNITS_PER_MM, true).map((path) =>
    path.map(({ x, y }) => ({ x: x / UNITS_PER_MM, y: y / UNITS_PER_MM })),
  );
}
