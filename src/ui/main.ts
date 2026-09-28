// The only layer that touches the DOM: one state object and a render().
import { APP_NAME } from '../core';
import { DecodeError, decodeSource, type Decoder, type Source } from '../core/source';
import { waveformPeaks } from '../core/waveform';
import './style.css';

type State =
  | { phase: 'empty' }
  | { phase: 'decoding'; fileName: string }
  | { phase: 'ready'; fileName: string; source: Source }
  | { phase: 'error'; fileName: string; message: string };

let state: State = { phase: 'empty' };

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const app = $('#app');
const fileInput = $<HTMLInputElement>('#file');
const status = $('#status');
const error = $('#error');
const waveform = $('#waveform');
const canvas = $<HTMLCanvasElement>('#waveform canvas');

app.dataset.app = APP_NAME;

let audioContext: AudioContext | undefined;

/** The browser's own decoder. Resamples to the AudioContext's rate. */
const nativeDecoder: Decoder = async (bytes) => {
  audioContext ??= new AudioContext();
  const buffer = await audioContext.decodeAudioData(bytes);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  return { sampleRate: buffer.sampleRate, channels };
};

// The ffmpeg fallback (ADR-0001) is appended here by its own slice.
const decoders: Decoder[] = [nativeDecoder];

function setState(next: State) {
  state = next;
  render();
}

// Guards against a slow decode finishing after the user picked another file.
let pick = 0;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const thisPick = ++pick;
  setState({ phase: 'decoding', fileName: file.name });
  try {
    // Read locally; the bytes never go anywhere but the decoder.
    const source = await decodeSource(await file.arrayBuffer(), decoders);
    if (thisPick === pick) setState({ phase: 'ready', fileName: file.name, source });
  } catch (e) {
    if (thisPick !== pick) return;
    if (!(e instanceof DecodeError)) console.error(e);
    const message =
      e instanceof DecodeError ? e.message : "Something went wrong reading this file. Try another.";
    setState({ phase: 'error', fileName: file.name, message });
  }
});

function render() {
  status.textContent =
    state.phase === 'decoding'
      ? `Reading ${state.fileName}…`
      : state.phase === 'ready'
        ? `${state.fileName}, ${state.source.duration.toFixed(1)} s`
        : '';
  error.hidden = state.phase !== 'error';
  error.textContent = state.phase === 'error' ? state.message : '';
  waveform.hidden = state.phase !== 'ready';
  drawWaveform();
}

function drawWaveform() {
  if (state.phase !== 'ready') return;
  const { samples } = state.source;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (width === 0 || height === 0) return;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { min, max } = waveformPeaks(samples, width);
  // Scale so the loudest sample fills the height, as the Stencil will.
  let peak = 0;
  for (let i = 0; i < width; i++) peak = Math.max(peak, Math.abs(min[i]!), Math.abs(max[i]!));
  const mid = height / 2;
  const scale = peak > 0 ? mid / peak : 0;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getComputedStyle(canvas).color;
  for (let x = 0; x < width; x++) {
    const top = mid - max[x]! * scale;
    const bottom = mid - min[x]! * scale;
    // At least one device pixel tall so silence still reads as a line.
    ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
  }
}

new ResizeObserver(drawWaveform).observe(canvas);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawWaveform);
render();
