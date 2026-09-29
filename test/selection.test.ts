import { describe, expect, it } from 'vitest';
import { tighten } from '../src/core/selection';

const RATE = 1000;
/** Tighten's short window, in samples at RATE. */
const WINDOW = 10;

/** Concatenate constant-amplitude square-wave runs, [amplitude, seconds] each. */
function sound(...runs: [amplitude: number, seconds: number][]): Float32Array {
  const out: number[] = [];
  for (const [amplitude, seconds] of runs) {
    for (let i = 0; i < seconds * RATE; i++) out.push(i % 2 ? -amplitude : amplitude);
  }
  return Float32Array.from(out);
}

describe('tighten', () => {
  it('moves both edges inward to the sound between silences', () => {
    // 0.3 s silence, 0.2 s sound, 0.5 s silence: sound is samples [300, 500).
    const samples = sound([0, 0.3], [0.8, 0.2], [0, 0.5]);
    const tightened = tighten(samples, RATE, { start: 0, end: 1000 });
    expect(tightened.start).toBeGreaterThanOrEqual(300 - WINDOW);
    expect(tightened.start).toBeLessThanOrEqual(300);
    expect(tightened.end).toBeGreaterThanOrEqual(500);
    expect(tightened.end).toBeLessThanOrEqual(500 + WINDOW);
  });

  it('keeps a quiet tail above the threshold and drops it below', () => {
    // A loud hit, then a tail 20 dB down (0.08 vs 0.8), then silence.
    const samples = sound([0, 0.1], [0.8, 0.1], [0.08, 0.3], [0, 0.1]);
    const all = { start: 0, end: samples.length };
    expect(tighten(samples, RATE, all).end).toBe(500);
    expect(tighten(samples, RATE, all, { thresholdDb: -10 }).end).toBe(200);
  });

  it("measures against the Selection's own peak, ignoring louder sound outside it", () => {
    // A loud bark, then a quiet one 40 dB down. Only the quiet one is selected.
    const samples = sound([0.9, 0.1], [0, 0.2], [0.009, 0.1], [0, 0.2]);
    expect(tighten(samples, RATE, { start: 150, end: 600 })).toEqual({ start: 300, end: 400 });
  });

  it('leaves a silent Selection as it is', () => {
    const samples = sound([0, 1]);
    expect(tighten(samples, RATE, { start: 120, end: 870 })).toEqual({ start: 120, end: 870 });
  });

  it('never moves an edge outward', () => {
    // Sound fills the whole Selection, whose edges are off the window grid.
    const samples = sound([0.5, 1]);
    expect(tighten(samples, RATE, { start: 103, end: 857 })).toEqual({ start: 103, end: 857 });
  });
});
