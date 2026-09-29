// The whole pipeline for one Style: Selection → Buckets → shapes → Stencil SVG.
import { barPolygon, bars, type BarsGeometry, type BarsOptions } from './bars';
import { buckets, compress, type BucketOptions, type CompressionOptions } from './buckets';
import { centerline, flatten, lineThickness, outline, type LineOptions, type Point } from './line';
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

/** An SVG ready to download. */
export interface SvgFile {
  svg: string;
  fileName: string;
}

interface Drawn extends SvgFile {
  /** The filled shapes the Stencil SVG draws, in mm: what Thin Spots are found in. */
  ink: Point[][];
}

export interface BarsStencil extends Drawn {
  style: 'bars';
  geometry: BarsGeometry;
}

export interface LineStencil extends Drawn {
  style: 'line';
  /** As drawn: the asked-for thickness, clamped. */
  thicknessMm: number;
  editable: SvgFile;
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
    ink: geometry.bars.map(barPolygon),
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
  const ink = outline(flatten(curve), thicknessMm);
  return {
    style: 'line',
    thicknessMm,
    ink,
    svg: stencilSvg(polygonsPath(ink), printSize),
    fileName: stencilFileName('line', printSize),
    editable: {
      svg: editableSvg(curvePath(curve), printSize, thicknessMm),
      fileName: editableFileName(printSize),
    },
  };
}
