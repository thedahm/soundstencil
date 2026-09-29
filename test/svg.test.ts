import { describe, expect, it } from 'vitest';
import {
  barsPath,
  curvePath,
  editableFileName,
  editableSvg,
  polygonsPath,
  stencilFileName,
  stencilSvg,
} from '../src/core/svg';

const SIZE = { widthMm: 80, heightMm: 25 };

describe('barsPath', () => {
  it('draws a square bar as a closed rectangle', () => {
    expect(barsPath([{ x: 1, y: 2, width: 3, height: 4, radius: 0 }])).toBe('M1 2H4V6H1Z');
  });

  it('draws one subpath per bar, rounded corners as arcs', () => {
    const d = barsPath([
      { x: 0, y: 0, width: 2, height: 10, radius: 1 },
      { x: 4, y: 0, width: 2, height: 10, radius: 1 },
    ]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(d.match(/A/g)).toHaveLength(8);
  });

  it('leaves out bars with no height', () => {
    expect(
      barsPath([
        { x: 0, y: 5, width: 1, height: 0, radius: 0 },
        { x: 2, y: 5, width: 1, height: 0.001, radius: 0 },
      ]),
    ).toBe('');
  });

  it('writes coordinates at 0.01 mm precision', () => {
    const d = barsPath([{ x: 1 / 3, y: 2 / 3, width: 1.0084, height: 10.005, radius: 0 }]);
    expect(d).toBe('M0.33 0.67H1.34V10.67H0.33Z');
  });
});

describe('polygonsPath', () => {
  it('draws each polygon as one closed subpath of straight lines', () => {
    expect(
      polygonsPath([
        [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
        [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }],
      ]),
    ).toBe('M0 0L1 0 1 1ZM2 2L3 2 3 3Z');
  });

  it('writes 0.01 mm precision, dropping points that round onto the one before', () => {
    expect(
      polygonsPath([[{ x: 1 / 3, y: 0 }, { x: 0.334, y: 0.001 }, { x: 2, y: 2 / 3 }, { x: 0, y: 1 }]]),
    ).toBe('M0.33 0L2 0.67 0 1Z');
  });
});

describe('curvePath', () => {
  it('draws the centerline as cubic Béziers from its start', () => {
    const d = curvePath({
      start: { x: 0.6, y: 12.5 },
      segments: [
        { c1: { x: 1, y: 12 }, c2: { x: 1.5, y: 1 / 3 }, to: { x: 2, y: 0.6 } },
        { c1: { x: 2.5, y: 1 }, c2: { x: 3, y: 12 }, to: { x: 3.4, y: 12.5 } },
      ],
    });
    expect(d).toBe('M0.6 12.5C1 12 1.5 0.33 2 0.6C2.5 1 3 12 3.4 12.5');
  });
});

describe('editableSvg', () => {
  const svg = editableSvg('M0 1C1 1 1 1 2 1', SIZE, 1.2);

  it('is the centerline as a round-capped, round-joined black stroke on the Stencil canvas', () => {
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="25mm" viewBox="0 0 80 25">' +
        '<path fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" d="M0 1C1 1 1 1 2 1"/></svg>\n',
    );
  });
});

describe('stencilSvg', () => {
  const svg = stencilSvg('M0 0H1V1H0Z', SIZE);

  it('is sized in mm at Print Size with a viewBox in mm', () => {
    expect(svg).toMatch(/^<svg [^>]*width="80mm"/);
    expect(svg).toMatch(/^<svg [^>]*height="25mm"/);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 80 25"/);
    expect(stencilSvg('', { widthMm: 80.456, heightMm: 25.1 })).toMatch(
      /width="80.46mm" height="25.1mm" viewBox="0 0 80.46 25.1"/,
    );
  });

  it('is one black-filled compound path and nothing else', () => {
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="25mm" viewBox="0 0 80 25">' +
        '<path fill="#000" d="M0 0H1V1H0Z"/></svg>\n',
    );
    expect(svg).not.toMatch(/stroke|<rect|<title|<desc|<metadata|<!--/);
  });
});

describe('stencilFileName', () => {
  it('names the Style and Print Size', () => {
    expect(stencilFileName('bars', SIZE)).toBe('soundstencil-bars-80x25mm.svg');
    expect(stencilFileName('line', SIZE)).toBe('soundstencil-line-80x25mm.svg');
    expect(stencilFileName('bars', { widthMm: 75.5, heightMm: 20 })).toBe(
      'soundstencil-bars-75.5x20mm.svg',
    );
  });
});

describe('editableFileName', () => {
  it('marks the Line export as editable', () => {
    expect(editableFileName(SIZE)).toBe('soundstencil-line-editable-80x25mm.svg');
  });
});
