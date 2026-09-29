// PNG export: the Stencil SVG rasterized at 600 DPI of Print Size. The browser
// does the rasterizing and encoding (from `rasterSvg`); this module sizes it and
// stamps the DPI into the result so printing at 100% gives true size.
import type { PrintSize } from './print-size';
import { fileName, type StyleName } from './svg';
import { fromMm } from './units';

export const PNG_DPI = 600;

/** Print Size in whole pixels at 600 DPI. */
export const pngPixels = ({ widthMm, heightMm }: PrintSize) => ({
  width: Math.round(fromMm(widthMm, 'in') * PNG_DPI),
  height: Math.round(fromMm(heightMm, 'in') * PNG_DPI),
});

/** Like `soundstencil-line-80x25mm.png`. */
export const pngFileName = (style: StyleName, printSize: PrintSize) => fileName(style, printSize, 'png');

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The PNG with a pHYs chunk saying `dpi`, right after IHDR (the PNG spec only
 * asks for before IDAT). Any pHYs already there is dropped; browsers' canvas
 * encoders write none.
 */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  if (png.length < 8 || SIGNATURE.some((byte, i) => png[i] !== byte)) throw new Error('Not a PNG');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  for (let at = 8; at < png.length; ) {
    const end = at + 12 + view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type !== 'pHYs') parts.push(png.subarray(at, end));
    if (type === 'IHDR') parts.push(pHYs(dpi));
    at = end;
  }
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function pHYs(dpi: number): Uint8Array {
  const pixelsPerMetre = Math.round(dpi * fromMm(1000, 'in'));
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  chunk[16] = 1; // Unit: metre.
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

let crcTable: Uint32Array | undefined;

/** CRC-32 as PNG uses it (ISO 3309), over a chunk's type and data. */
function crc32(bytes: Uint8Array): number {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
