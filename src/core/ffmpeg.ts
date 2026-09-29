// The fallback decoder (ADR-0001): when the browser can't decode a Source,
// ffmpeg extracts its audio to WAV and the browser decodes that instead.
// The ffmpeg wrapper itself lives in the UI; this is the part worth testing.

import type { DecodedAudio, Decoder } from './source';

/**
 * Where the GPL ffmpeg core is fetched from at runtime: the single-threaded ESM
 * build, pinned to an exact version. public/_headers allows exactly this URL,
 * and a test asserts the two match, so bump them together.
 */
export const FFMPEG_CORE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';

/** The slice of ffmpeg.wasm's API the fallback uses. */
export interface Transcoder {
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /** Runs ffmpeg with these arguments; resolves to its exit code. */
  exec(args: string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<void>;
}

export interface FfmpegDecoderOptions {
  /** Downloads and starts ffmpeg. Called on first use only, again if it failed. */
  load: () => Promise<Transcoder>;
  /** Decodes the extracted WAV "as normal": the browser's native decoder. */
  decodeWav: (wav: ArrayBuffer) => Promise<DecodedAudio>;
}

const INPUT = 'source';
const OUTPUT = 'source.wav';

/** A Decoder that loads ffmpeg on first use and extracts the audio to WAV. */
export function ffmpegDecoder({ load, decodeWav }: FfmpegDecoderOptions): Decoder {
  let loading: Promise<Transcoder> | undefined;
  const transcoder = () => {
    loading ??= load().catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
    return loading;
  };

  return async (bytes) => {
    const ffmpeg = await transcoder();
    await ffmpeg.writeFile(INPUT, new Uint8Array(bytes));
    try {
      // Audio only, as 16-bit PCM WAV: every browser decodes that. Channels and
      // sample rate are kept; decodeSource() downmixes as usual.
      const code = await ffmpeg.exec(['-i', INPUT, '-vn', '-acodec', 'pcm_s16le', OUTPUT]);
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
      const wav = await ffmpeg.readFile(OUTPUT);
      return await decodeWav(wav.slice().buffer);
    } finally {
      // Best-effort: the output is missing if ffmpeg failed.
      await Promise.allSettled([ffmpeg.deleteFile(INPUT), ffmpeg.deleteFile(OUTPUT)]);
    }
  };
}
