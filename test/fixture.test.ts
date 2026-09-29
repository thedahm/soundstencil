import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tighten } from '../src/core/selection';
import { decodeSource } from '../src/core/source';
import { waveformPeaks } from '../src/core/waveform';
import { wavDecoder } from './fixtures/wav';

const bytes = async () => {
  const file = readFileSync(new URL('./fixtures/bark.wav', import.meta.url));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
};

describe('bark.wav fixture', () => {
  it('decodes to a 0.8 s mono Source at 48 kHz', async () => {
    const source = await decodeSource(bytes, [wavDecoder]);
    expect(source.sampleRate).toBe(48000);
    expect(source.samples.length).toBe(38400);
    expect(source.duration).toBeCloseTo(0.8);
  });

  it('has one loud bark in the middle and near-silence at both ends', async () => {
    const source = await decodeSource(bytes, [wavDecoder]);
    // 80 columns of 10 ms each.
    const { min, max } = waveformPeaks(source.samples, 80);
    const loudness = Array.from(max, (hi, i) => Math.max(hi, -min[i]!));
    const loudest = loudness.indexOf(Math.max(...loudness));

    expect(loudness[loudest]).toBeGreaterThan(0.9);
    expect(loudest).toBeGreaterThanOrEqual(25); // 0.25 s
    expect(loudest).toBeLessThan(40); // 0.40 s, the attack
    expect(Math.max(...loudness.slice(0, 20))).toBeLessThan(0.02);
    expect(Math.max(...loudness.slice(-10))).toBeLessThan(0.02);
  });

  it('tightens from the whole file to the bark', async () => {
    const source = await decodeSource(bytes, [wavDecoder]);
    const seconds = (thresholdDb?: number) => {
      const { start, end } = tighten(
        source.samples,
        source.sampleRate,
        { start: 0, end: source.samples.length },
        { thresholdDb },
      );
      return { start: start / source.sampleRate, end: end / source.sampleRate };
    };

    // The README puts the bark at about 0.25 s to 0.65 s. The default −30 dB,
    // measured against the clipped attack, lets the quiet end of the tail go.
    const byDefault = seconds();
    expect(byDefault.start).toBeCloseTo(0.25, 1);
    expect(byDefault.end).toBeGreaterThan(0.4);
    expect(byDefault.end).toBeLessThan(0.6);

    // A lower threshold keeps the whole tail.
    const lenient = seconds(-50);
    expect(lenient.start).toBeCloseTo(0.25, 1);
    expect(lenient.end).toBeCloseTo(0.65, 1);
  });
});
