import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pngFileName, pngPixels, withDpi } from '../src/core/png';

const SIZE = { widthMm: 80, heightMm: 25 };
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: number[]): number[] {
  const typeAndData = [...Buffer.from(type, 'latin1'), ...data];
  return [...u32(data.length), ...typeAndData, ...u32(crc32(Buffer.from(typeAndData)))];
}

// 1×1, 8-bit RGBA. Enough structure for chunk surgery; nothing decodes it.
const IHDR = chunk('IHDR', [...u32(1), ...u32(1), 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [1, 2, 3]);
const IEND = chunk('IEND', []);
const png = (...chunks: number[][]) => new Uint8Array([...SIGNATURE, ...chunks.flat()]);

describe('withDpi', () => {
  it('writes a pHYs chunk for 600 DPI straight after IHDR', () => {
    const out = withDpi(png(IHDR, IDAT, IEND), 600);
    // 600 DPI = 23622 pixels per metre (0x5C46), both axes, unit 1 (metre).
    const pHYs = [
      0, 0, 0, 9,
      0x70, 0x48, 0x59, 0x73,
      0, 0, 0x5c, 0x46,
      0, 0, 0x5c, 0x46,
      1,
      0x14, 0x94, 0x43, 0x41,
    ];
    expect([...out]).toEqual([...SIGNATURE, ...IHDR, ...pHYs, ...IDAT, ...IEND]);
  });

  it('has a CRC that matches zlib', () => {
    const out = withDpi(png(IHDR, IDAT, IEND), 600);
    const at = SIGNATURE.length + IHDR.length;
    const crc = new DataView(out.buffer).getUint32(at + 17);
    expect(crc).toBe(crc32(out.subarray(at + 4, at + 17)));
  });

  it('replaces any pHYs the encoder already wrote', () => {
    const existing = chunk('pHYs', [...u32(2835), ...u32(2835), 1]);
    const out = withDpi(png(IHDR, existing, IDAT, IEND), 600);
    expect(out).toEqual(withDpi(png(IHDR, IDAT, IEND), 600));
  });

  it('rejects anything that is not a PNG', () => {
    expect(() => withDpi(new Uint8Array([1, 2, 3]), 600)).toThrow(/PNG/);
  });
});

describe('pngPixels', () => {
  it('is Print Size at 600 DPI, rounded to whole pixels', () => {
    // 80 mm = 3.1496 in → 1889.8 px; 25 mm = 0.9843 in → 590.6 px.
    expect(pngPixels(SIZE)).toEqual({ width: 1890, height: 591 });
  });

  it('is exact for whole inches', () => {
    expect(pngPixels({ widthMm: 25.4, heightMm: 50.8 })).toEqual({ width: 600, height: 1200 });
  });
});

describe('pngFileName', () => {
  it('names the Style and Print Size', () => {
    expect(pngFileName('line', SIZE)).toBe('soundstencil-line-80x25mm.png');
    expect(pngFileName('bars', { widthMm: 101.6, heightMm: 12.7 })).toBe('soundstencil-bars-101.6x12.7mm.png');
  });
});
