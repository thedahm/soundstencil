import { describe, expect, it, vi } from 'vitest';
import { FFMPEG_CORE_URL, ffmpegDecoder, type Transcoder } from '../src/core/ffmpeg';

/** A Transcoder whose ffmpeg turns any input into the WAV bytes given. */
function fakeTranscoder(wav = new Uint8Array([82, 73, 70, 70]), exitCode = 0) {
  const files = new Map<string, Uint8Array>();
  const runs: string[][] = [];
  const written: Uint8Array[] = [];
  const transcoder: Transcoder = {
    async writeFile(path, data) {
      files.set(path, data);
      written.push(data);
    },
    async exec(args) {
      runs.push(args);
      if (exitCode === 0) files.set(args.at(-1)!, wav);
      return exitCode;
    },
    async readFile(path) {
      const data = files.get(path);
      if (!data) throw new Error(`No such file: ${path}`);
      return data;
    },
    async deleteFile(path) {
      files.delete(path);
    },
  };
  return { transcoder, files, runs, written };
}

const decoded = { sampleRate: 44100, channels: [new Float32Array(4)] };
const bytes = () => new Uint8Array([1, 2, 3]).buffer;

describe('FFMPEG_CORE_URL', () => {
  it('pins the single-threaded core on jsDelivr to an exact version', () => {
    expect(FFMPEG_CORE_URL).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/@ffmpeg\/core@\d+\.\d+\.\d+\/dist\/esm\/$/,
    );
  });
});

describe('ffmpegDecoder', () => {
  it('loads nothing until a Source needs it', () => {
    const load = vi.fn();
    ffmpegDecoder({ load, decodeWav: vi.fn() });
    expect(load).not.toHaveBeenCalled();
  });

  it('extracts the audio to WAV and decodes that as normal', async () => {
    const wav = new Uint8Array([9, 9, 9]);
    const { transcoder, runs } = fakeTranscoder(wav);
    const decodeWav = vi.fn(async (_wav: ArrayBuffer) => decoded);
    const decode = ffmpegDecoder({ load: async () => transcoder, decodeWav });
    expect(await decode(bytes())).toBe(decoded);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain('-vn');
    expect(runs[0]!.at(-1)).toMatch(/\.wav$/);
    expect(new Uint8Array(decodeWav.mock.calls[0]![0])).toEqual(wav);
  });

  it('gives ffmpeg the file bytes', async () => {
    const { transcoder, written } = fakeTranscoder();
    await ffmpegDecoder({ load: async () => transcoder, decodeWav: async () => decoded })(bytes());
    expect(Array.from(written[0]!)).toEqual([1, 2, 3]);
  });

  it('removes its files afterwards, so the next Source starts clean', async () => {
    const { transcoder, files } = fakeTranscoder();
    await ffmpegDecoder({ load: async () => transcoder, decodeWav: async () => decoded })(bytes());
    expect(files.size).toBe(0);
  });

  it('loads the core once and reuses it', async () => {
    const { transcoder } = fakeTranscoder();
    const load = vi.fn(async () => transcoder);
    const decode = ffmpegDecoder({ load, decodeWav: async () => decoded });
    await decode(bytes());
    await decode(bytes());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries loading again after a failed load', async () => {
    const { transcoder } = fakeTranscoder();
    const load = vi
      .fn<() => Promise<Transcoder>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(transcoder);
    const decode = ffmpegDecoder({ load, decodeWav: async () => decoded });
    await expect(decode(bytes())).rejects.toThrow('offline');
    await expect(decode(bytes())).resolves.toBe(decoded);
  });

  it('fails when ffmpeg exits with an error', async () => {
    const { transcoder, files } = fakeTranscoder(undefined, 1);
    const decode = ffmpegDecoder({ load: async () => transcoder, decodeWav: async () => decoded });
    await expect(decode(bytes())).rejects.toThrow();
    expect(files.size).toBe(0);
  });
});
