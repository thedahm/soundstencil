// The whole pipeline for one Style: Selection → Buckets → shapes → Stencil SVG.
import { bars, type BarsGeometry, type BarsOptions } from './bars';
import { buckets, compress, type BucketOptions, type CompressionOptions } from './buckets';
import { DEFAULT_PRINT_SIZE, type PrintSize } from './print-size';
import type { Selection } from './selection';
import { barsPath, stencilFileName, stencilSvg } from './svg';

/** Every control the user can set. Anything left out takes its default. */
export interface Design extends BucketOptions, CompressionOptions, BarsOptions {
  printSize?: PrintSize;
}

export interface Stencil {
  geometry: BarsGeometry;
  svg: string;
  fileName: string;
}

export function barsStencil(
  samples: Float32Array,
  selection: Selection,
  design: Design = {},
): Stencil {
  const printSize = design.printSize ?? DEFAULT_PRINT_SIZE;
  const heights = compress(buckets(samples, selection, design), printSize, design);
  const geometry = bars(heights, printSize, design);
  return {
    geometry,
    svg: stencilSvg(barsPath(geometry.bars), printSize),
    fileName: stencilFileName('bars', printSize),
  };
}
