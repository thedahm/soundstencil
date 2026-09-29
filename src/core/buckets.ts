// Buckets and Compression: the Selection reduced to N loudness values, then
// turned into heights at Print Size. Every Style draws from the same Buckets.
import type { PrintSize } from './print-size';
import type { Selection } from './selection';
import { DEFAULT_THIN_SPOT_MM } from './thin-spots';

export type Reduction = 'peak' | 'rms';

export const MIN_BUCKETS = 30;
export const MAX_BUCKETS = 80;
export const DEFAULT_BUCKETS = 48;

export interface BucketOptions {
  /** N, clamped to MIN_BUCKETS..MAX_BUCKETS. */
  count?: number;
  reduction?: Reduction;
}

/**
 * Split the Selection into `count` contiguous, near-equal runs and reduce each
 * to its peak (largest absolute sample) or RMS. With fewer samples than
 * Buckets, neighbouring Buckets share a sample, as in waveformPeaks().
 */
export function buckets(
  samples: Float32Array,
  selection: Selection,
  { count = DEFAULT_BUCKETS, reduction = 'peak' }: BucketOptions = {},
): Float32Array {
  const n = Math.min(MAX_BUCKETS, Math.max(MIN_BUCKETS, Math.round(count)));
  const start = Math.max(0, Math.floor(selection.start));
  const length = Math.max(0, Math.min(samples.length, Math.ceil(selection.end)) - start);
  const out = new Float32Array(n);
  if (length === 0) return out;
  for (let b = 0; b < n; b++) {
    const from = start + Math.floor((b * length) / n);
    const to = Math.max(from + 1, start + Math.floor(((b + 1) * length) / n));
    let value = 0;
    if (reduction === 'peak') {
      for (let i = from; i < to; i++) value = Math.max(value, Math.abs(samples[i]!));
    } else {
      for (let i = from; i < to; i++) value += samples[i]! ** 2;
      value = Math.sqrt(value / (to - from));
    }
    out[b] = value;
  }
  return out;
}

export const MIN_GAMMA = 0.3;
export const MAX_GAMMA = 1;
export const DEFAULT_GAMMA = 0.6;
/** The minimum height floor: the default Thin Spot threshold. */
export const DEFAULT_FLOOR_MM = DEFAULT_THIN_SPOT_MM;

export interface CompressionOptions {
  /** γ in h = v^γ, clamped to MIN_GAMMA..MAX_GAMMA. Lower lifts quiet Buckets more. */
  gamma?: number;
  /** Minimum height at Print Size, so quiet Buckets stay visible. */
  floorMm?: number;
}

/**
 * Bucket heights in mm at Print Size. Loudness is taken relative to the
 * loudest Bucket, compressed as v^γ, scaled so the loudest reaches max height,
 * then lifted to the floor. The floor never exceeds max height.
 */
export function compress(
  loudness: Float32Array,
  { heightMm }: PrintSize,
  { gamma = DEFAULT_GAMMA, floorMm = DEFAULT_FLOOR_MM }: CompressionOptions = {},
): number[] {
  const g = Math.min(MAX_GAMMA, Math.max(MIN_GAMMA, gamma));
  const floor = Math.min(heightMm, Math.max(0, floorMm));
  let loudest = 0;
  for (const v of loudness) loudest = Math.max(loudest, v);
  return Array.from(loudness, (v) =>
    Math.max(floor, loudest > 0 ? (v / loudest) ** g * heightMm : 0),
  );
}
