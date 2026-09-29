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

// Names in ffmpeg's in-memory file system. Fixed, so decodes take turns.
const SOURCE_FILE = 'source';
const WAV_FILE = 'source.wav';

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

  // One ffmpeg, one file system: a second pick waits for the first to finish.
  let queue: Promise<unknown> = Promise.resolve();

  const extract = async (bytes: ArrayBuffer) => {
    const ffmpeg = await transcoder();
    await ffmpeg.writeFile(SOURCE_FILE, new Uint8Array(bytes));
    try {
      // Audio only, as 16-bit PCM WAV: every browser decodes that. Channels and
      // sample rate are kept; decodeSource() downmixes as usual.
      const code = await ffmpeg.exec(['-i', SOURCE_FILE, '-vn', '-acodec', 'pcm_s16le', WAV_FILE]);
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
      return (await ffmpeg.readFile(WAV_FILE)).slice().buffer;
    } finally {
      // Best-effort: the WAV is missing if ffmpeg failed.
      await Promise.allSettled([ffmpeg.deleteFile(SOURCE_FILE), ffmpeg.deleteFile(WAV_FILE)]);
    }
  };

  return async (bytes) => {
    const wav = queue.then(() => extract(bytes));
    queue = wav.catch(() => {});
    return decodeWav(await wav);
  };
}
