// The whole pipeline for one Style: Selection → Buckets → shapes → Stencil SVG.
import { bars, type BarsGeometry, type BarsOptions } from './bars';
import { buckets, compress, type BucketOptions, type CompressionOptions } from './buckets';
import { centerline, flatten, lineThickness, outline, type LineOptions } from './line';
import { DEFAULT_PRINT_SIZE, type PrintSize } from './print-size';
import type { Selection } from './selection';
import {
  barsPath,
  curvePath,
  editableFileName,
  editableSvg,
  polygonsPath,
  stencilFileName,
  stencilSvg,
  type StyleName,
} from './svg';

/** Every control the user can set. Anything left out takes its default. */
export interface Design extends BucketOptions, CompressionOptions, BarsOptions, LineOptions {
  /** Line by default. */
  style?: StyleName;
  printSize?: PrintSize;
}

export interface BarsStencil {
  style: 'bars';
  geometry: BarsGeometry;
  svg: string;
  fileName: string;
}

export interface LineStencil {
  style: 'line';
  /** As drawn: the asked-for thickness, clamped. */
  thicknessMm: number;
  svg: string;
  fileName: string;
  editable: { svg: string; fileName: string };
}

export type Stencil = BarsStencil | LineStencil;

/** The Stencil in the Style the Design asks for. */
export const stencil = (samples: Float32Array, selection: Selection, design: Design = {}): Stencil =>
  design.style === 'bars'
    ? barsStencil(samples, selection, design)
    : lineStencil(samples, selection, design);

/** Bucket heights at Print Size, shared by every Style. */
function heights(samples: Float32Array, selection: Selection, design: Design) {
  const printSize = design.printSize ?? DEFAULT_PRINT_SIZE;
  return { printSize, heightsMm: compress(buckets(samples, selection, design), printSize, design) };
}

export function barsStencil(
  samples: Float32Array,
  selection: Selection,
  design: Design = {},
): BarsStencil {
  const { printSize, heightsMm } = heights(samples, selection, design);
  const geometry = bars(heightsMm, printSize, design);
  return {
    style: 'bars',
    geometry,
    svg: stencilSvg(barsPath(geometry.bars), printSize),
    fileName: stencilFileName('bars', printSize),
  };
}

export function lineStencil(
  samples: Float32Array,
  selection: Selection,
  design: Design = {},
): LineStencil {
  const { printSize, heightsMm } = heights(samples, selection, design);
  const thicknessMm = lineThickness(printSize, design.thicknessMm);
  const curve = centerline(heightsMm, printSize, { ...design, thicknessMm });
  return {
    style: 'line',
    thicknessMm,
    svg: stencilSvg(polygonsPath(outline(flatten(curve), thicknessMm)), printSize),
    fileName: stencilFileName('line', printSize),
    editable: {
      svg: editableSvg(curvePath(curve), printSize, thicknessMm),
      fileName: editableFileName(printSize),
    },
  };
}
