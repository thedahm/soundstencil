// The only layer that touches the DOM: one state object and a render().
import { APP_NAME } from '../core';
import { DEFAULT_TIGHTEN_THRESHOLD_DB, tighten, type Selection } from '../core/selection';
import { DecodeError, decodeSource, type Decoder, type Source } from '../core/source';
import { waveformPeaks } from '../core/waveform';
import './style.css';

interface Editing {
  /** None until the user drags one: there is no automatic guess at the sound. */
  selection: Selection | null;
  /** The samples the waveform shows: the whole Source, or zoomed to the Selection. */
  view: Selection;
  /** Earlier Selections, most recent last. */
  undo: (Selection | null)[];
  playing: boolean;
}

type State =
  | { phase: 'empty' }
  | { phase: 'decoding'; fileName: string }
  | { phase: 'ready'; fileName: string; source: Source; edit: Editing }
  | { phase: 'error'; fileName: string; message: string };

let state: State = { phase: 'empty' };

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const app = $('#app');
const fileInput = $<HTMLInputElement>('#file');
const status = $('#status');
const error = $('#error');
const editor = $('#editor');
const waveform = $('#waveform');
const canvas = $<HTMLCanvasElement>('#waveform canvas');
const selectionBox = $('#selection');
const playhead = $('#playhead');
const handles = { start: $('#handle-start'), end: $('#handle-end') };
const selectionInfo = $('#selection-info');
const playButton = $<HTMLButtonElement>('#play');
const zoomButton = $<HTMLButtonElement>('#zoom');
const tightenButton = $<HTMLButtonElement>('#tighten');
const undoButton = $<HTMLButtonElement>('#undo');
const thresholdInput = $<HTMLInputElement>('#threshold');

app.dataset.app = APP_NAME;

/**
 * The browser's own decoder. An OfflineAudioContext decodes without needing a
 * user gesture or claiming the device's audio output; it resamples to its rate.
 */
const nativeDecoder: Decoder = async (bytes) => {
  const buffer = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  return { sampleRate: buffer.sampleRate, channels };
};

// The ffmpeg fallback (ADR-0001) is appended here by its own slice.
const decoders: Decoder[] = [nativeDecoder];

function setState(next: State) {
  if (state.phase === 'ready' && (next.phase !== 'ready' || next.source !== state.source)) {
    stopAudio();
  }
  const redraw = next.phase !== state.phase || viewOf(next) !== viewOf(state);
  state = next;
  render();
  if (redraw) drawWaveform();
}

const viewOf = (s: State) => (s.phase === 'ready' ? s.edit.view : undefined);

/** Change the ready Source's editing state; a no-op in any other phase. */
function edit(change: (edit: Editing, source: Source) => Partial<Editing>) {
  if (state.phase !== 'ready') return;
  setState({ ...state, edit: { ...state.edit, ...change(state.edit, state.source) } });
}

/** Replace the Selection, remembering the old one for Undo. */
function select(selection: Selection | null, before = currentSelection()) {
  edit(({ undo }) => ({ selection, undo: [...undo, before] }));
  restartLoop();
}

const currentSelection = () => (state.phase === 'ready' ? state.edit.selection : null);

const same = (a: Selection | null, b: Selection | null) =>
  a === b || (!!a && !!b && a.start === b.start && a.end === b.end);

// Guards against a slow decode finishing after the user picked another file.
let latestPick = 0;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  // Clear so picking the same file again (say, after an error) still fires change.
  fileInput.value = '';
  if (!file) return;
  const pick = ++latestPick;
  setState({ phase: 'decoding', fileName: file.name });
  try {
    // Read locally; the bytes never go anywhere but the decoder.
    const source = await decodeSource(await file.arrayBuffer(), decoders);
    if (pick !== latestPick) return;
    const whole = { start: 0, end: source.samples.length };
    setState({
      phase: 'ready',
      fileName: file.name,
      source,
      edit: { selection: null, view: whole, undo: [], playing: false },
    });
  } catch (e) {
    if (pick !== latestPick) return;
    let message = "Something went wrong reading this file. Try another.";
    if (e instanceof DecodeError) message = e.message;
    else console.error(e);
    setState({ phase: 'error', fileName: file.name, message });
  }
});

// Selecting: drag across the waveform for a new Selection, or drag a handle to
// move one edge. Either way one end stays put (the anchor) and the other
// follows the pointer, so dragging a handle past the other just swaps them.

/** Pixels a new-Selection drag must travel, so a tap never selects. */
const DRAG_SLOP = 4;

let drag:
  | { pointerId: number; anchor: number; fromX: number; before: Selection | null; moved: boolean }
  | undefined;

/** The Source sample under a clientX, clamped to the view. */
function sampleAt(clientX: number): number {
  if (state.phase !== 'ready') return 0;
  const { view } = state.edit;
  const rect = canvas.getBoundingClientRect();
  const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(view.start + t * (view.end - view.start));
}

waveform.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'ready' || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const selection = state.edit.selection;
  const handle = e.target === handles.start ? 'start' : e.target === handles.end ? 'end' : null;
  const anchor =
    handle && selection ? (handle === 'start' ? selection.end : selection.start) : sampleAt(e.clientX);
  drag = { pointerId: e.pointerId, anchor, fromX: e.clientX, before: selection, moved: !!handle };
  waveform.setPointerCapture(e.pointerId);
});

waveform.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.abs(e.clientX - drag.fromX) < DRAG_SLOP) return;
  drag.moved = true;
  const at = sampleAt(e.clientX);
  if (at === drag.anchor) return;
  const selection = { start: Math.min(at, drag.anchor), end: Math.max(at, drag.anchor) };
  edit(() => ({ selection }));
});

function endDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { before } = drag;
  drag = undefined;
  const after = currentSelection();
  if (e.type === 'pointercancel') edit(() => ({ selection: before }));
  else if (!same(before, after)) select(after, before);
}
waveform.addEventListener('pointerup', endDrag);
waveform.addEventListener('pointercancel', endDrag);

// Keyboard: arrows nudge the focused handle by 10 ms, Shift for 100 ms.
for (const [edge, handle] of Object.entries(handles) as ['start' | 'end', HTMLElement][]) {
  handle.addEventListener('keydown', (e) => {
    const selection = currentSelection();
    if (state.phase !== 'ready' || !selection) return;
    const step = Math.round(state.source.sampleRate * (e.shiftKey ? 0.1 : 0.01));
    const delta = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step
      : 0;
    if (!delta) return;
    e.preventDefault();
    // An edge stops one sample short of the other.
    const next =
      edge === 'start'
        ? { ...selection, start: clamp(selection.start + delta, 0, selection.end - 1) }
        : { ...selection, end: clamp(selection.end + delta, selection.start + 1, state.source.samples.length) };
    if (!same(next, selection)) select(next);
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

tightenButton.addEventListener('click', () => {
  const selection = currentSelection();
  if (state.phase !== 'ready' || !selection) return;
  const next = tighten(state.source.samples, state.source.sampleRate, selection, {
    thresholdDb: thresholdDb(),
  });
  if (!same(next, selection)) select(next);
});

/** The threshold input, or the default when it is empty or out of range. */
function thresholdDb(): number {
  const value = thresholdInput.valueAsNumber;
  const [min, max] = [Number(thresholdInput.min), Number(thresholdInput.max)];
  return Number.isFinite(value) ? clamp(value, min, max) : DEFAULT_TIGHTEN_THRESHOLD_DB;
}

undoButton.addEventListener('click', () => {
  edit(({ undo }) => ({ selection: undo.at(-1) ?? null, undo: undo.slice(0, -1) }));
  restartLoop();
});

/** Fraction of the Selection's length shown either side of it when zoomed. */
const ZOOM_MARGIN = 0.25;

zoomButton.addEventListener('click', () => {
  edit(({ selection, view }, source) => {
    const whole = { start: 0, end: source.samples.length };
    if (!selection || isZoomed(view, source)) return { view: whole };
    const margin = Math.ceil((selection.end - selection.start) * ZOOM_MARGIN);
    return {
      view: {
        start: Math.max(0, selection.start - margin),
        end: Math.min(whole.end, selection.end + margin),
      },
    };
  });
});

const isZoomed = (view: Selection, source: Source) =>
  view.start > 0 || view.end < source.samples.length;

// Loop playback of the Selection. One AudioContext for the page, created on the
// first press because browsers (iOS Safari especially) only start audio from a
// user gesture. A change to the Selection restarts the loop from its new start.

let audio: AudioContext | undefined;
let loop:
  | { node: AudioBufferSourceNode; buffer: AudioBuffer; startedAt: number; selection: Selection }
  | undefined;
const buffers = new WeakMap<Source, AudioBuffer>();

playButton.addEventListener('click', () => {
  if (state.phase !== 'ready') return;
  if (state.edit.playing) {
    stopLoop();
    return;
  }
  audio ??= new AudioContext();
  void audio.resume();
  edit(() => ({ playing: true }));
  restartLoop();
});

function restartLoop() {
  if (state.phase !== 'ready' || !state.edit.playing || !audio) return;
  const { source } = state;
  const selection = state.edit.selection;
  stopAudio();
  if (!selection) {
    stopLoop();
    return;
  }

  let buffer = buffers.get(source);
  if (!buffer) {
    buffer = audio.createBuffer(1, source.samples.length, source.sampleRate);
    buffer.getChannelData(0).set(source.samples);
    buffers.set(source, buffer);
  }
  const node = audio.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.loopStart = selection.start / source.sampleRate;
  node.loopEnd = selection.end / source.sampleRate;
  node.connect(audio.destination);
  node.start(0, node.loopStart);
  loop = { node, buffer, startedAt: audio.currentTime, selection };
  requestAnimationFrame(movePlayhead);
}

function stopAudio() {
  loop?.node.stop();
  loop = undefined;
}

function stopLoop() {
  stopAudio();
  if (state.phase === 'ready' && state.edit.playing) edit(() => ({ playing: false }));
}

function movePlayhead() {
  if (!loop || !audio || state.phase !== 'ready') {
    playhead.hidden = true;
    return;
  }
  const { sampleRate } = loop.buffer;
  const length = loop.selection.end - loop.selection.start;
  const elapsed = Math.max(0, (audio.currentTime - loop.startedAt) * sampleRate);
  placeAt(playhead, loop.selection.start + (elapsed % length));
  requestAnimationFrame(movePlayhead);
}

/** Put an element's left edge at a Source sample; hide it outside the view. */
function placeAt(element: HTMLElement, sample: number) {
  if (state.phase !== 'ready') return;
  const { view } = state.edit;
  const fraction = (sample - view.start) / (view.end - view.start);
  element.hidden = fraction < 0 || fraction > 1;
  element.style.left = `${fraction * 100}%`;
}

const seconds = (samples: number, source: Source) => (samples / source.sampleRate).toFixed(2);

function render() {
  status.textContent =
    state.phase === 'decoding'
      ? `Reading ${state.fileName}…`
      : state.phase === 'ready'
        ? `${state.fileName}, ${state.source.duration.toFixed(1)} s`
        : '';
  error.hidden = state.phase !== 'error';
  error.textContent = state.phase === 'error' ? state.message : '';
  editor.hidden = state.phase !== 'ready';
  if (state.phase === 'ready') renderSelection(state.source, state.edit);
}

function renderSelection(source: Source, { selection, view, undo, playing }: Editing) {
  const zoomed = isZoomed(view, source);
  canvas.setAttribute(
    'aria-label',
    zoomed
      ? `Waveform from ${seconds(view.start, source)} s to ${seconds(view.end, source)} s`
      : 'Waveform of the whole file',
  );
  selectionInfo.textContent = selection
    ? `Selection ${seconds(selection.start, source)} s to ${seconds(selection.end, source)} s, ` +
      `${seconds(selection.end - selection.start, source)} s long`
    : 'Drag across the waveform to select the sound.';

  if (selection) {
    const left = clamp(selection.start, view.start, view.end);
    const right = clamp(selection.end, view.start, view.end);
    const span = view.end - view.start;
    selectionBox.hidden = right <= left;
    selectionBox.style.left = `${((left - view.start) / span) * 100}%`;
    selectionBox.style.width = `${((right - left) / span) * 100}%`;
    for (const edge of ['start', 'end'] as const) {
      const handle = handles[edge];
      placeAt(handle, selection[edge]);
      handle.setAttribute('aria-valuemin', '0');
      handle.setAttribute('aria-valuemax', seconds(source.samples.length, source));
      handle.setAttribute('aria-valuenow', seconds(selection[edge], source));
      handle.setAttribute('aria-valuetext', `${seconds(selection[edge], source)} seconds`);
    }
  } else {
    selectionBox.hidden = true;
    handles.start.hidden = true;
    handles.end.hidden = true;
  }

  playButton.textContent = playing ? 'Stop' : 'Loop play';
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.disabled = !selection;
  zoomButton.textContent = zoomed ? 'Show whole file' : 'Zoom to Selection';
  zoomButton.disabled = !selection && !zoomed;
  tightenButton.disabled = !selection;
  undoButton.disabled = undo.length === 0;
}

function drawWaveform() {
  if (state.phase !== 'ready') return;
  const { view } = state.edit;
  const samples = state.source.samples.subarray(view.start, view.end);
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
