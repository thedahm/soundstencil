// Starts ffmpeg.wasm for the fallback decoder (ADR-0001). Imported dynamically,
// only once native decode has failed, so the wrapper stays out of the main
// bundle and the GPL core is downloaded from its pinned URL, never shipped.

import { FFMPEG_CORE_URL, type Transcoder } from '../core/ffmpeg';

/** Download the core and start ffmpeg in its worker. */
export async function loadFfmpeg(): Promise<Transcoder> {
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ]);
  // No download progress: jsDelivr compresses the wasm, so Content-Length is
  // the compressed size, and toBlobURL's progress mode then fails the download.
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${FFMPEG_CORE_URL}ffmpeg-core.js`, 'text/javascript'),
    toBlobURL(`${FFMPEG_CORE_URL}ffmpeg-core.wasm`, 'application/wasm'),
  ]);
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({ coreURL, wasmURL });
  } catch (error) {
    ffmpeg.terminate();
    throw error;
  } finally {
    URL.revokeObjectURL(coreURL);
    URL.revokeObjectURL(wasmURL);
  }
  return {
    async writeFile(path, data) {
      await ffmpeg.writeFile(path, data);
    },
    exec: (args) => ffmpeg.exec(args),
    async readFile(path) {
      const data = await ffmpeg.readFile(path);
      if (typeof data === 'string') throw new Error(`ffmpeg read ${path} as text`);
      return data;
    },
    async deleteFile(path) {
      await ffmpeg.deleteFile(path);
    },
  };
}
