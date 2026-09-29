import { describe, expect, it } from 'vitest';
import { thinSpots } from '../src/core/thin-spots';

const rect = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

/** Room for the grid: spots are found to within about 0.05 mm here. */
const near = (actual: number, expected: number, within = 0.1) =>
  expect(Math.abs(actual - expected)).toBeLessThan(within);

describe('thinSpots', () => {
  it('finds a gap narrower than the threshold between two shapes', () => {
    const spots = thinSpots([rect(0, 0, 5, 5), rect(5.5, 0, 5, 5)], 1);
    expect(spots).toHaveLength(1);
    const { kind, box, areaMm2 } = spots[0]!;
    expect(kind).toBe('gap');
    near(box.x, 5);
    near(box.width, 0.5);
    near(box.y, 0);
    near(box.height, 5);
    near(areaMm2, 2.5, 0.3);
  });

  it('finds ink narrower than the threshold: all of a 0.5 mm bar', () => {
    const spots = thinSpots([rect(0, 0, 0.5, 10)], 1);
    expect(spots.map((s) => s.kind)).toEqual(['ink']);
    near(spots[0]!.areaMm2, 5, 0.5);
  });

  it('finds only the thin part of a shape', () => {
    // A 5 mm block with a 0.4 mm wide, 3 mm long tail.
    const shape = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2.3 },
      { x: 8, y: 2.3 },
      { x: 8, y: 2.7 },
      { x: 5, y: 2.7 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const spots = thinSpots([shape], 1);
    expect(spots.map((s) => s.kind)).toEqual(['ink']);
    const { box } = spots[0]!;
    near(box.x, 5, 0.6);
    near(box.x + box.width, 8);
    near(box.y, 2.3);
    near(box.height, 0.4);
  });

  it('counts nothing at the threshold, or wider', () => {
    expect(thinSpots([rect(0, 0, 1, 10)], 1)).toEqual([]);
    expect(thinSpots([rect(0, 0, 5, 5), rect(6, 0, 5, 5)], 1)).toEqual([]);
    expect(thinSpots([rect(0, 0, 5, 5), rect(8, 0, 5, 5)], 1)).toEqual([]);
  });

  it('ignores the crumbs any square corner leaves, inside or out', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(thinSpots([l], 1)).toEqual([]);
  });

  it('follows the threshold, and finds nothing with a threshold of 0', () => {
    const shapes = [rect(0, 0, 5, 5), rect(6.5, 0, 5, 5)];
    expect(thinSpots(shapes, 1)).toEqual([]);
    expect(thinSpots(shapes, 2)).toHaveLength(1);
    expect(thinSpots([rect(0, 0, 0.1, 5)], 0)).toEqual([]);
  });

  it('keeps separate spots separate', () => {
    const spots = thinSpots([rect(0, 0, 5, 5), rect(5.5, 0, 5, 5), rect(11, 0, 5, 5)], 1);
    expect(spots).toHaveLength(2);
    expect(spots.map((s) => Math.round(s.box.x * 2) / 2).sort((a, b) => a - b)).toEqual([5, 10.5]);
  });

  it('finds nothing in no ink', () => {
    expect(thinSpots([], 1)).toEqual([]);
  });
});
