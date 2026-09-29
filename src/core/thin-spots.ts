// Thin Spots: parts of the design narrower at Print Size than the threshold,
// which may blur or drop out once tattooed. Advisory only; nothing here
// changes the Stencil.
import type { Point } from './line';

export const DEFAULT_THIN_SPOT_MM = 1;

export interface ThinSpot {
  /** Ink: a bar or line segment too thin. Gap: skin between inked parts too narrow. */
  kind: 'ink' | 'gap';
  /** The rectangle around the spot, in mm with the origin top left. */
  box: { x: number; y: number; width: number; height: number };
  areaMm2: number;
}

/**
 * The grid is capped at this many cells, and never finer than MIN_CELL_MM: at
 * the default Print Size a cell is about 0.075 mm.
 */
const MAX_CELLS = 400_000;
const MIN_CELL_MM = 0.02;

/**
 * Every Thin Spot in the ink (the Stencil's filled polygons): ink that a disc
 * as wide as the threshold can't pass through (the ink minus its morphological
 * opening), and gaps between inked parts it can't pass through (the closing
 * minus the ink).
 *
 * Found on a grid, by exact distance transforms, so in linear time however
 * curved the ink. Measurements are good to about a cell, and anything within
 * a cell of the threshold counts as wide enough: the Stencil's 1 mm floor
 * never flags itself.
 *
 * Every inside corner has a tiny gap of that kind in its crook, and every
 * square outside corner a tiny sliver of ink, however wide the parts around
 * them. So a spot must cover at least a quarter of the threshold squared: a
 * right angle leaves about a fifth of that, and a gap or bar shorter than a
 * quarter of the threshold is too small to matter.
 */
export function thinSpots(
  ink: readonly (readonly Point[])[],
  thresholdMm = DEFAULT_THIN_SPOT_MM,
): ThinSpot[] {
  const points = ink.flat();
  if (!(thresholdMm > 0) || points.length === 0) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cell = Math.max(MIN_CELL_MM, Math.sqrt(((maxX - minX + 2 * thresholdMm) * (maxY - minY + 2 * thresholdMm)) / MAX_CELLS));
  // Room around the ink for the closing to grow into, and white beyond that.
  const margin = thresholdMm + 2 * cell;
  const grid: Grid = {
    x0: minX - margin,
    y0: minY - margin,
    cell,
    width: Math.ceil((maxX - minX + 2 * margin) / cell),
    height: Math.ceil((maxY - minY + 2 * margin) / cell),
  };
  // The disc's radius in cells, less half a cell of leeway.
  const r = thresholdMm / 2 / cell - 0.5;
  if (r <= 0) return [];
  const r2 = r * r;

  const inked = rasterize(ink, grid);
  const opened = within(inside(inked, r2, grid), r2, grid);
  const closed = inside(within(inked, r2, grid), r2, grid);

  const thinInk = new Uint8Array(inked.length);
  const gaps = new Uint8Array(inked.length);
  for (let i = 0; i < inked.length; i++) {
    thinInk[i] = inked[i]! & (1 - opened[i]!);
    gaps[i] = closed[i]! & (1 - inked[i]!);
  }
  const minCells = (thresholdMm / cell) ** 2 / 4;
  return [...components(thinInk, 'ink', grid, minCells), ...components(gaps, 'gap', grid, minCells)];
}

interface Grid {
  /** The top-left corner of the top-left cell, in mm. */
  x0: number;
  y0: number;
  /** Cell size in mm. */
  cell: number;
  width: number;
  height: number;
}

/** 1 for every cell whose centre is inside the ink (nonzero winding). */
function rasterize(polygons: readonly (readonly Point[])[], { x0, y0, cell, width, height }: Grid): Uint8Array {
  const out = new Uint8Array(width * height);
  const crossings: { x: number; winding: number }[][] = Array.from({ length: height }, () => []);
  // Cell centres sit at half-cell offsets; a row counts an edge that spans its centre.
  const row = (y: number) => Math.ceil((y - y0) / cell - 0.5);
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      if (a.y === b.y) continue;
      const [lo, hi] = a.y < b.y ? [a, b] : [b, a];
      for (let j = Math.max(0, row(lo.y)); j < Math.min(height, row(hi.y)); j++) {
        const y = y0 + (j + 0.5) * cell;
        crossings[j]!.push({ x: lo.x + ((y - lo.y) / (hi.y - lo.y)) * (hi.x - lo.x), winding: b.y > a.y ? 1 : -1 });
      }
    }
  }
  const column = (x: number) => Math.min(width, Math.max(0, Math.ceil((x - x0) / cell - 0.5)));
  for (let j = 0; j < height; j++) {
    const list = crossings[j]!.sort((p, q) => p.x - q.x);
    let winding = 0;
    for (let k = 0; k < list.length - 1; k++) {
      winding += list[k]!.winding;
      if (winding !== 0) out.fill(1, j * width + column(list[k]!.x), j * width + column(list[k + 1]!.x));
    }
  }
  return out;
}

/** 1 for every cell at least √r2 cells from any unset cell. */
function inside(mask: Uint8Array, r2: number, grid: Grid): Uint8Array {
  const d = distances(mask, 0, grid);
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i]! >= r2 ? 1 : 0;
  return out;
}

/** 1 for every cell within √r2 cells of a set cell. */
function within(mask: Uint8Array, r2: number, grid: Grid): Uint8Array {
  const d = distances(mask, 1, grid);
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i]! <= r2 ? 1 : 0;
  return out;
}

/**
 * The squared distance, in cells, from every cell to the nearest cell whose
 * mask value is `target` (Infinity if there is none). Exact Euclidean
 * (Felzenszwalb and Huttenlocher): one pass down the columns, then one along
 * the rows. The margin keeps ink away from the grid's edge, so beyond it never
 * needs to count.
 */
function distances(mask: Uint8Array, target: 0 | 1, { width, height }: Grid): Float64Array {
  const out = new Float64Array(width * height);
  const size = Math.max(width, height);
  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  // The lower envelope of the parabolas rooted at each finite f[q].
  const line = (n: number) => {
    let k = -1;
    for (let q = 0; q < n; q++) {
      const fq = f[q]!;
      if (fq === Infinity) continue;
      let s = -Infinity;
      while (k >= 0) {
        const p = v[k]!;
        s = (fq + q * q - (f[p]! + p * p)) / (2 * (q - p));
        if (s > z[k]!) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = k === 0 ? -Infinity : s;
      z[k + 1] = Infinity;
    }
    if (k < 0) {
      d.fill(Infinity, 0, n);
      return;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1]! < q) k++;
      const p = v[k]!;
      d[q] = (q - p) ** 2 + f[p]!;
    }
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = mask[y * width + x] === target ? 0 : Infinity;
    line(height);
    for (let y = 0; y < height; y++) out[y * width + x] = d[y]!;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = out[y * width + x]!;
    line(width);
    for (let x = 0; x < width; x++) out[y * width + x] = d[x]!;
  }
  return out;
}

/** Each 8-connected region of set cells at least `minCells` big, as a Thin Spot. */
function components(mask: Uint8Array, kind: ThinSpot['kind'], grid: Grid, minCells: number): ThinSpot[] {
  const { width, height, x0, y0, cell } = grid;
  const seen = new Uint8Array(mask.length);
  const spots: ThinSpot[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let [left, right, top, bottom, count] = [width, -1, height, -1, 0];
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const [x, y] = [i % width, Math.floor(i / width)];
      [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
      count++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [nx, ny] = [x + dx, y + dy];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (mask[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    if (count < minCells) continue;
    spots.push({
      kind,
      box: {
        x: x0 + left * cell,
        y: y0 + top * cell,
        width: (right - left + 1) * cell,
        height: (bottom - top + 1) * cell,
      },
      areaMm2: count * cell * cell,
    });
  }
  return spots;
}
