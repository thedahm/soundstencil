import { describe, expect, it, vi } from 'vitest';
import { DecodeError, decodeSource, downmix } from '../src/core/source';

describe('downmix', () => {
  it('returns a mono Source unchanged', () => {
    const mono = new Float32Array([0, 0.5, -1]);
    expect(Array.from(downmix([mono]))).toEqual([0, 0.5, -1]);
  });

  it('averages channels with equal weight', () => {
    const left = new Float32Array([1, 0.5, -1, 0]);
    const right = new Float32Array([0, 0.5, 1, -0.5]);
    expect(Array.from(downmix([left, right]))).toEqual([0.5, 0.5, 0, -0.25]);
  });

  it('averages any number of channels', () => {
    const a = new Float32Array([0.75, 0]);
    const b = new Float32Array([0, 0]);
    const c = new Float32Array([0, -0.75]);
    expect(Array.from(downmix([a, b, c]))).toEqual([0.25, -0.25]);
  });

  it('rejects a Source with no channels', () => {
    expect(() => downmix([])).toThrow();
  });
});

describe('decodeSource', () => {
  const read = async () => new Uint8Array([1, 2, 3, 4]).buffer;
  const stereo = {
    sampleRate: 48000,
    channels: [new Float32Array(4).fill(1), new Float32Array(4)],
  };

  it('decodes to mono samples with sample rate and duration', async () => {
    const source = await decodeSource(read, [async () => stereo]);
    expect(source.sampleRate).toBe(48000);
    expect(Array.from(source.samples)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(source.duration).toBeCloseTo(4 / 48000);
  });

  it('falls back to the next decoder when one fails', async () => {
    const source = await decodeSource(read, [
      async () => {
        throw new Error('EncodingError');
      },
      async () => stereo,
    ]);
    expect(source.samples.length).toBe(4);
  });

  it('reads the file afresh for each decoder, since a failed decode can detach its bytes', async () => {
    const seen: number[] = [];
    await decodeSource(read, [
      async (b) => {
        seen.push(b.byteLength);
        structuredClone(b, { transfer: [b] }); // what decodeAudioData does
        throw new Error('EncodingError');
      },
      async (b) => {
        seen.push(b.byteLength);
        return stereo;
      },
    ]);
    expect(seen).toEqual([4, 4]);
  });

  it('reads the file once when the first decoder succeeds, so a large video is not held twice', async () => {
    const counted = vi.fn(read);
    await decodeSource(counted, [async () => stereo, async () => stereo]);
    expect(counted).toHaveBeenCalledTimes(1);
  });

  it('fails with a friendly DecodeError when no decoder can read the file', async () => {
    const attempt = decodeSource(read, [
      async () => {
        throw new Error('Unable to decode audio data');
      },
    ]);
    await expect(attempt).rejects.toBeInstanceOf(DecodeError);
    await expect(attempt).rejects.toThrow(/couldn't read the sound/i);
  });

  it('suggests a desktop browser when no decoder can read the file on a phone', async () => {
    const attempt = decodeSource(
      read,
      [
        async () => {
          throw new Error('Unable to decode audio data');
        },
      ],
      { phone: true },
    );
    await expect(attempt).rejects.toBeInstanceOf(DecodeError);
    await expect(attempt).rejects.toThrow(/desktop/i);
  });

  it('fails with a DecodeError when the file has no sound in it', async () => {
    const attempt = decodeSource(read, [async () => ({ sampleRate: 44100, channels: [] })]);
    await expect(attempt).rejects.toBeInstanceOf(DecodeError);
    await expect(attempt).rejects.toThrow(/no sound/i);
  });
});
