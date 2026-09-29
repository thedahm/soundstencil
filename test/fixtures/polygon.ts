// Polygon checks for tests, written independently of Clipper.

export interface Point {
  x: number;
  y: number;
}

/** Whether segments ab and cd properly cross. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** No two edges cross, checked pair by pair. */
export function isSimple(polygon: readonly Point[]): boolean {
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

export const area = (polygon: readonly Point[]) =>
  Math.abs(
    polygon.reduce((sum, a, i) => {
      const b = polygon[(i + 1) % polygon.length]!;
      return sum + a.x * b.y - b.x * a.y;
    }, 0) / 2,
  );
