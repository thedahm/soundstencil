// The on-screen overview of a Source. Display only: Buckets are a separate
// reduction of the Selection and do not come from here.

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
}

/**
 * Split the samples into `columns` contiguous runs (one per device pixel) and
 * keep each run's min and max, so a short spike is always drawn. With more
 * columns than samples, neighbouring columns share a sample.
 */
export function waveformPeaks(samples: Float32Array, columns: number): WaveformPeaks {
  const n = samples.length;
  const count = n === 0 ? 0 : Math.max(0, Math.floor(columns));
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const start = Math.floor((c * n) / count);
    const end = Math.max(start + 1, Math.floor(((c + 1) * n) / count));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = start; i < end; i++) {
      const s = samples[i]!;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
}
