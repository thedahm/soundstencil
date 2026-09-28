import { readFileSync } from 'node:fs';
import type { DecodedAudio } from '../../src/core/source';

/**
 * Minimal 16-bit PCM WAV reader, standing in for decodeAudioData() in tests.
 * Node has no Web Audio, and the fixtures are all 16-bit PCM.
 */
export function readWav(bytes: ArrayBuffer): DecodedAudio {
  const view = new DataView(bytes);
  const tag = (at: number) =>
    String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');

  let format: { channels: number; sampleRate: number; bits: number; pcm: boolean } | undefined;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      const code = view.getUint16(body, true);
      format = {
        // 0xfffe is WAVE_FORMAT_EXTENSIBLE; its subformat GUID starts with the real code.
        pcm: (code === 0xfffe ? view.getUint16(body + 24, true) : code) === 1,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!format?.pcm || format.bits !== 16) throw new Error('Only 16-bit PCM is supported');
      const frames = Math.floor(size / 2 / format.channels);
      const channels = Array.from({ length: format.channels }, () => new Float32Array(frames));
      for (let f = 0; f < frames; f++) {
        for (let c = 0; c < format.channels; c++) {
          channels[c]![f] = view.getInt16(body + (f * format.channels + c) * 2, true) / 32768;
        }
      }
      return { sampleRate: format.sampleRate, channels };
    }
    at = body + size + (size % 2); // chunks are word-aligned
  }
  throw new Error('WAV has no data chunk');
}

export function readWavFile(path: string | URL): DecodedAudio {
  const file = readFileSync(path);
  return readWav(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}
