// The Source: the user's file, decoded to mono samples. Nothing here touches the
// file itself; the UI reads the bytes and hands them to a decoder.

/** What a decoder yields: one sample array per channel, all the same length. */
export interface DecodedAudio {
  sampleRate: number;
  channels: Float32Array[];
}

/**
 * Turns the file's bytes into samples, or throws. The UI supplies the browser's
 * native decodeAudioData(); the ffmpeg fallback (ADR-0001) is appended after it.
 */
export type Decoder = (bytes: ArrayBuffer) => Promise<DecodedAudio>;

export interface Source {
  sampleRate: number;
  /** Mono, see downmix(). */
  samples: Float32Array;
  /** Seconds. */
  duration: number;
}

/** A decode failure with a message fit to show the user as-is. */
export class DecodeError extends Error {
  override name = 'DecodeError';
}

/**
 * Try each decoder in order and return the first success as a mono Source.
 * decodeAudioData() detaches the buffer it is given, even when it fails, so
 * every decoder but the last gets a copy. The last gets the original, so the
 * usual single-decoder case never holds a large video in memory twice.
 */
export async function decodeSource(
  bytes: ArrayBuffer,
  decoders: readonly Decoder[],
): Promise<Source> {
  let decoded: DecodedAudio | undefined;
  const failures: unknown[] = [];
  for (const [i, decode] of decoders.entries()) {
    try {
      decoded = await decode(i === decoders.length - 1 ? bytes : bytes.slice(0));
      break;
    } catch (error) {
      failures.push(error);
    }
  }
  if (!decoded) {
    throw new DecodeError(
      "Couldn't read the sound in this file. Try another video or audio file, or a different browser.",
      { cause: failures },
    );
  }
  const length = decoded.channels[0]?.length ?? 0;
  if (length === 0) throw new DecodeError('This file has no sound in it.');
  const samples = downmix(decoded.channels);
  return { sampleRate: decoded.sampleRate, samples, duration: length / decoded.sampleRate };
}

/**
 * Downmix to mono by averaging every channel with equal weight.
 *
 * For stereo this is 0.5 * (L + R), the same as Web Audio's "speakers" downmix.
 * Averaging (rather than summing) keeps samples in [-1, 1], and because the
 * loudest Bucket is scaled to max height later, the absolute level never shows.
 * Channels that are out of phase partly cancel; for a phone recording of a bark
 * that is not a real concern.
 */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  const [first] = channels;
  if (!first) throw new Error('A Source needs at least one channel.');
  if (channels.length === 1) return first;
  const mono = new Float32Array(first.length);
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) mono[i]! += channel[i] ?? 0;
  }
  for (let i = 0; i < mono.length; i++) mono[i]! /= channels.length;
  return mono;
}
