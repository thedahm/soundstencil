import { describe, expect, it } from 'vitest';
import { centerline, FLATNESS_MM, flatten, outline, type Point } from '../src/core/line';

const SIZE = { widthMm: 10, heightMm: 25 };
const round = (n: number) => Math.round(n * 1e6) / 1e6;

describe('centerline', () => {
  // Thickness 1: 0.5 mm inset all round, so x runs 0.5..9.5 and y 0.5..24.5.
  // Three Buckets at the middle of thirds of 9 mm: x = 2, 5, 8.
  // Heights scale by (25 − 1) / 25, so 25 mm swings 12 either side of 12.5.
  const heights = [25, 12.5, 25];

  it('swings each Bucket about the middle with alternating sign, from and back to the middle', () => {
    const { start, segments } = centerline(heights, SIZE, { thicknessMm: 1 });
    expect(start).toEqual({ x: 0.5, y: 12.5 });
    const anchors = segments.map(({ to }) => [round(to.x), round(to.y)]);
    expect(anchors).toEqual([
      [2, 0.5],
      [5, 18.5],
      [8, 0.5],
      [9.5, 12.5],
    ]);
  });

  it('draws straight segments at smoothing 0', () => {
    const { segments } = centerline(heights, SIZE, { thicknessMm: 1, smoothing: 0 });
    const second = segments[1]!;
    expect(second.c1.x).toBeCloseTo(2);
    expect(second.c1.y).toBeCloseTo(0.5);
    expect(second.c2.x).toBeCloseTo(5);
    expect(second.c2.y).toBeCloseTo(18.5);
  });

  it('is a Catmull-Rom spline at smoothing 1', () => {
    // From (2, 0.5) to (5, 18.5), neighbours (0.5, 12.5) and (8, 0.5):
    // c1 = p1 + (p2 − p0) / 6, c2 = p2 − (p3 − p1) / 6.
    const { segments } = centerline(heights, SIZE, { thicknessMm: 1, smoothing: 1 });
    const second = segments[1]!;
    expect(second.c1.x).toBeCloseTo(2.75);
    expect(second.c1.y).toBeCloseTo(1.5);
    expect(second.c2.x).toBeCloseTo(4);
    expect(second.c2.y).toBeCloseTo(18.5);
  });

  it('keeps every control point, and so the whole curve, where the stroke fits the Print Size', () => {
    const { segments } = centerline([25, 1, 25, 1, 25, 3, 25], SIZE, { thicknessMm: 2, smoothing: 1 });
    for (const { c1, c2, to } of segments) {
      for (const { x, y } of [c1, c2, to]) {
        expect(x).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(x).toBeLessThanOrEqual(9 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(y).toBeLessThanOrEqual(24 + 1e-9);
      }
    }
  });

  it('defaults to 1.2 mm thick at 0.8 smoothing', () => {
    const { start, segments } = centerline(heights, SIZE);
    expect(start.x).toBeCloseTo(0.6);
    // c1 = p1 + 0.8 (p2 − p0) / 6, with p0 = (0.6, 12.5), p2 at x 5.
    const anchorX = 0.6 + 8.8 / 6;
    expect(segments[1]!.c1.x).toBeCloseTo(anchorX + (0.8 * (5 - 0.6)) / 6);
  });
});

describe('flatten', () => {
  const curve = centerline([25, 1, 25, 12], SIZE);
  const points = flatten(curve);

  it('passes through the start and every anchor', () => {
    expect(points[0]).toEqual(curve.start);
    for (const { to } of curve.segments) expect(points).toContainEqual(to);
    expect(points.at(-1)).toEqual(curve.segments.at(-1)!.to);
  });

  it('stays within FLATNESS_MM of the curve everywhere', () => {
    let from = curve.start;
    let worst = 0;
    for (const { c1, c2, to } of curve.segments) {
      for (let k = 0; k <= 200; k++) {
        const t = k / 200;
        const u = 1 - t;
        const at = (p0: number, p1: number, p2: number, p3: number) =>
          u ** 3 * p0 + 3 * u ** 2 * t * p1 + 3 * u * t ** 2 * p2 + t ** 3 * p3;
        const p = { x: at(from.x, c1.x, c2.x, to.x), y: at(from.y, c1.y, c2.y, to.y) };
        worst = Math.max(worst, distanceToPolyline(p, points));
      }
      from = to;
    }
    expect(worst).toBeLessThanOrEqual(FLATNESS_MM);
  });

  it('bends in more points than it runs straight', () => {
    const straight = flatten(centerline([25, 1, 25, 12], SIZE, { smoothing: 0 }));
    expect(straight).toHaveLength(6);
    expect(points.length).toBeGreaterThan(20);
  });
});

function distanceToPolyline(p: Point, line: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1]!, line[i]!];
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/** Whether segments ab and cd properly cross. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** No two edges cross, checked pair by pair. */
function isSimple(polygon: readonly Point[]): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // Neighbours across the closing edge.
      const [a, b, c, d] = [polygon[i]!, polygon[(i + 1) % n]!, polygon[j]!, polygon[(j + 1) % n]!];
      if (crosses(a, b, c, d)) return false;
    }
  }
  return true;
}

const area = (polygon: readonly Point[]) =>
  Math.abs(
    polygon.reduce((sum, a, i) => {
      const b = polygon[(i + 1) % polygon.length]!;
      return sum + a.x * b.y - b.x * a.y;
    }, 0) / 2,
  );

describe('outline', () => {
  it('turns a sharp transient into a single non-self-intersecting polygon', () => {
    // Spikes 24 mm tall, 1.26 mm apart, 1.2 mm thick: offsetting each point
    // along its normal would fold over itself at every tip.
    const curve = centerline([1, 1, 25, 1, 25, 1, 1], SIZE);
    const polygons = outline(flatten(curve), 1.2);
    expect(polygons).toHaveLength(1);
    expect(polygons[0]!.length).toBeGreaterThan(3);
    expect(isSimple(polygons[0]!)).toBe(true);
  });

  it('stays one simple polygon with 80 Buckets swinging full height, at full smoothing', () => {
    const heights = Array.from({ length: 80 }, (_, i) => (i % 3 ? 25 : 1));
    const curve = centerline(heights, { widthMm: 80, heightMm: 25 }, { smoothing: 1 });
    const polygons = outline(flatten(curve), 1.2);
    expect(polygons).toHaveLength(1);
    expect(isSimple(polygons[0]!)).toBe(true);
  });

  it('fills the Print Size: round caps at the sides, loudest edge at max height', () => {
    const polygons = outline(flatten(centerline([25, 5, 25], SIZE, { smoothing: 0 })), 1.2);
    const xs = polygons.flat().map((p) => p.x);
    const ys = polygons.flat().map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(10, 1);
    expect(Math.min(...ys)).toBeCloseTo(0, 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(25);
  });

  it('is as thick as asked, with round caps', () => {
    // A flat line 9 mm long and 2 mm thick: 9·2 + π·1² mm².
    const [polygon] = outline([{ x: 1, y: 5 }, { x: 10, y: 5 }], 2);
    expect(area(polygon!)).toBeCloseTo(18 + Math.PI, 1);
  });
});
