import { describe, expect, it } from 'vitest';
import { barsPath, stencilFileName, stencilSvg } from '../src/core/svg';

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
    expect(stencilFileName('bars', { widthMm: 75.5, heightMm: 20 })).toBe(
      'soundstencil-bars-75.5x20mm.svg',
    );
  });
});
