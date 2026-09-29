// SVG output, written by hand. The Stencil SVG is what a tattoo artist prints
// or traces: black fills only, one compound path, sized in real mm.
import type { Bar } from './bars';
import type { Curve, Point } from './line';
import type { PrintSize } from './print-size';

export type StyleName = 'line' | 'bars';

/** A length in mm at 0.01 precision, without trailing zeros. */
export const mm = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Every bar as one closed subpath, clockwise from the top-left corner, with
 * quarter-circle arcs for rounded corners. Coordinates are absolute, so
 * rounding never accumulates along a subpath.
 */
export function barsPath(bars: readonly Bar[]): string {
  return bars
    .map(({ x, y, width, height, radius: r }) => {
      const [left, top, right, bottom] = [x, y, x + width, y + height].map(mm);
      // Too short to draw at this precision (only possible with a 0 floor).
      if (top === bottom) return '';
      if (r <= 0)return `M${left} ${top}H${right}V${bottom}H${left}Z`;
      const arc = (toX: number, toY: number) => `A${mm(r)} ${mm(r)} 0 0 1 ${mm(toX)} ${mm(toY)}`;
      const [innerLeft, innerRight] = [mm(x + r), mm(x + width - r)];
      const [innerTop, innerBottom] = [mm(y + r), mm(y + height - r)];
      // A full pill's straight edges have no length; leave them out.
      const h = (to: string) => (innerLeft === innerRight ? '' : `H${to}`);
      const v = (to: string) => (innerTop === innerBottom ? '' : `V${to}`);
      return (
        `M${innerLeft} ${top}${h(innerRight)}${arc(x + width, y + r)}` +
        `${v(innerBottom)}${arc(x + width - r, y + height)}` +
        `${h(innerLeft)}${arc(x, y + height - r)}` +
        `${v(innerTop)}${arc(x + r, y)}Z`
      );
    })
    .join('');
}

/**
 * Every polygon as one closed subpath of straight lines. A point that rounds
 * onto the one before it adds nothing, so it is left out.
 */
export function polygonsPath(polygons: readonly (readonly Point[])[]): string {
  return polygons
    .map((polygon) => {
      const points: string[] = [];
      for (const { x, y } of polygon) {
        const point = `${mm(x)} ${mm(y)}`;
        if (point !== points.at(-1)) points.push(point);
      }
      if (points.length > 1 && points[0] === points.at(-1)) points.pop();
      if (points.length < 3) return '';
      return `M${points[0]}L${points.slice(1).join(' ')}Z`;
    })
    .join('');
}

/** A curve as its cubic Béziers, for the Editable SVG. */
export function curvePath({ start, segments }: Curve): string {
  const p = ({ x, y }: Point) => `${mm(x)} ${mm(y)}`;
  return `M${p(start)}` + segments.map(({ c1, c2, to }) => `C${p(c1)} ${p(c2)} ${p(to)}`).join('');
}

const svgOpen = ({ widthMm, heightMm }: PrintSize) => {
  const [w, h] = [mm(widthMm), mm(heightMm)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`;
};

/** The Stencil SVG: one `<path fill="#000">`, no stroke, background, or metadata. */
export function stencilSvg(d: string, printSize: PrintSize): string {
  return `${svgOpen(printSize)}<path fill="#000" d="${d}"/></svg>\n`;
}

/**
 * The Editable SVG: the Line's centerline as a black stroke on the same canvas,
 * for an artist to restyle. Not stencil-ready.
 */
export function editableSvg(d: string, printSize: PrintSize, thicknessMm: number): string {
  return (
    `${svgOpen(printSize)}<path fill="none" stroke="#000" stroke-width="${mm(thicknessMm)}" ` +
    `stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>\n`
  );
}

/** Like `soundstencil-bars-80x25mm.svg`. */
export const stencilFileName = (style: StyleName, { widthMm, heightMm }: PrintSize) =>
  `soundstencil-${style}-${mm(widthMm)}x${mm(heightMm)}mm.svg`;

/** Like `soundstencil-line-editable-80x25mm.svg`. */
export const editableFileName = ({ widthMm, heightMm }: PrintSize) =>
  `soundstencil-line-editable-${mm(widthMm)}x${mm(heightMm)}mm.svg`;
