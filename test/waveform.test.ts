import { describe, expect, it } from 'vitest';
import { waveformPeaks } from '../src/core/waveform';

describe('waveformPeaks', () => {
  it('reduces each column to the min and max of its samples', () => {
    const peaks = waveformPeaks(new Float32Array([0.5, -0.25, 1, 0]), 2);
    expect(Array.from(peaks.min)).toEqual([-0.25, 0]);
    expect(Array.from(peaks.max)).toEqual([0.5, 1]);
  });

  it('covers every sample when columns do not divide evenly', () => {
    // 5 samples over 2 columns: [0, 2) and [2, 5).
    const peaks = waveformPeaks(new Float32Array([0, 0, 0, 0, 0.75]), 2);
    expect(Array.from(peaks.max)).toEqual([0, 0.75]);
  });

  it('never drops a one-sample spike, wherever it lands', () => {
    for (let at = 0; at < 1000; at += 37) {
      const samples = new Float32Array(1000);
      samples[at] = -1;
      expect(Math.min(...waveformPeaks(samples, 333).min)).toBe(-1);
    }
  });

  it('repeats samples when there are more columns than samples', () => {
    const peaks = waveformPeaks(new Float32Array([0.25, -0.5]), 4);
    expect(Array.from(peaks.max)).toEqual([0.25, 0.25, -0.5, -0.5]);
    expect(Array.from(peaks.min)).toEqual([0.25, 0.25, -0.5, -0.5]);
  });

  it('is empty with no columns or no samples', () => {
    expect(waveformPeaks(new Float32Array([1]), 0).max.length).toBe(0);
    expect(waveformPeaks(new Float32Array(0), 10).max.length).toBe(0);
  });
});
