import { describe, expect, it } from 'vitest';
import { defaultUnit, formatLength, fromMm, scaleBarMm, toMm } from '../src/core/units';

describe('defaultUnit', () => {
  it('is inches for US English, cm elsewhere', () => {
    expect(defaultUnit(['en-US'])).toBe('in');
    expect(defaultUnit(['en-GB'])).toBe('cm');
    expect(defaultUnit(['de-DE', 'en-US'])).toBe('cm');
  });
});

describe('lengths', () => {
  it('converts mm to and from the display unit', () => {
    expect(fromMm(80, 'cm')).toBe(8);
    expect(fromMm(25.4, 'in')).toBe(1);
    expect(toMm(2.5, 'cm')).toBe(25);
    expect(toMm(0.5, 'in')).toBe(12.7);
  });

  it('formats to 0.01 of the unit, without trailing zeros', () => {
    expect(formatLength(80, 'cm')).toBe('8 cm');
    expect(formatLength(80, 'in')).toBe('3.15 in');
    expect(formatLength(1, 'cm')).toBe('0.1 cm');
    expect(formatLength(1, 'in')).toBe('0.04 in');
  });

  it('formats finer when asked, to match an input that shows more', () => {
    expect(formatLength(1, 'in', 3)).toBe('0.039 in');
    expect(formatLength(25.4, 'in', 3)).toBe('1 in');
  });

  it('has a scale bar of 1 cm or half an inch', () => {
    expect(scaleBarMm('cm')).toBe(10);
    expect(scaleBarMm('in')).toBe(12.7);
    expect(formatLength(scaleBarMm('in'), 'in')).toBe('0.5 in');
  });
});
