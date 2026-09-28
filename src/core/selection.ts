// The Selection: the user-chosen time range of the Source that becomes the
// tattoo. Nothing here guesses one; the user always makes the first Selection.

/** A range of Source samples, `start` inclusive and `end` exclusive. */
export interface Selection {
  start: number;
  end: number;
}

export interface TightenOptions {
  /** How far below the Selection's peak still counts as sound. */
  thresholdDb?: number;
  /** Length of each RMS window, in seconds. */
  windowSeconds?: number;
}

export const DEFAULT_TIGHTEN_THRESHOLD_DB = -30;
const DEFAULT_WINDOW_SECONDS = 0.01;

/**
 * Tighten: move the Selection's edges inward to the first and last short
 * windows whose RMS is within `thresholdDb` of the loudest window in the
 * Selection. Edges snap outward to window boundaries, so the sound's onset and
 * tail are kept whole. Only ever narrows; a silent Selection comes back as is.
 */
export function tighten(
  samples: Float32Array,
  sampleRate: number,
  selection: Selection,
  { thresholdDb = DEFAULT_TIGHTEN_THRESHOLD_DB, windowSeconds = DEFAULT_WINDOW_SECONDS }: TightenOptions = {},
): Selection {
  const start = Math.max(0, Math.floor(selection.start));
  const end = Math.min(samples.length, Math.ceil(selection.end));
  const size = Math.max(1, Math.round(windowSeconds * sampleRate));

  // Windows are laid from the Selection's start; the last may be short.
  const rms: number[] = [];
  for (let from = start; from < end; from += size) {
    const to = Math.min(end, from + size);
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i]! ** 2;
    rms.push(Math.sqrt(sum / (to - from)));
  }

  let peak = 0;
  for (const v of rms) peak = Math.max(peak, v);
  if (peak === 0) return selection;
  const floor = peak * 10 ** (thresholdDb / 20);
  let first = 0;
  while (rms[first]! < floor) first++;
  let last = rms.length - 1;
  while (rms[last]! < floor) last--;
  return { start: start + first * size, end: Math.min(end, start + (last + 1) * size) };
}
