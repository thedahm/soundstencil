// The only layer that touches the DOM: one state object and a render().
import { APP_NAME } from '../core';
import {
  DEFAULT_TIGHTEN_THRESHOLD_DB,
  tighten,
  type SampleRange,
  type Selection,
} from '../core/selection';
import { DecodeError, decodeSource, type Decoder, type Source } from '../core/source';
import { DEFAULT_FILL_RATIO, DEFAULT_ROUNDING } from '../core/bars';
import { DEFAULT_BUCKETS, DEFAULT_FLOOR_MM, DEFAULT_GAMMA } from '../core/buckets';
import { DEFAULT_SMOOTHING, DEFAULT_THICKNESS_MM } from '../core/line';
import { pngFileName, pngPixels, PNG_DPI, withDpi } from '../core/png';
import { DEFAULT_PRINT_SIZE } from '../core/print-size';
import { stencil as drawStencil, type Design, type Stencil, type SvgFile } from '../core/stencil';
import { mm, rasterSvg, type StyleName } from '../core/svg';
import { DEFAULT_THIN_SPOT_MM, thinSpots, type ThinSpot } from '../core/thin-spots';
import { defaultUnit, formatLength, fromMm, roundTo, scaleBarMm, toMm, type Unit } from '../core/units';
import { waveformPeaks } from '../core/waveform';
import './style.css';

interface Editing {
  /** None until the user drags one: there is no automatic guess at the sound. */
  selection: Selection | null;
  /** The samples the waveform shows: the whole Source, or zoomed to the Selection. */
  view: SampleRange;
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
const designForm = $<HTMLFormElement>('#design');
const styleRadios = designForm.elements.namedItem('style') as RadioNodeList;
const designInputs = {
  count: $<HTMLInputElement>('#count'),
  gamma: $<HTMLInputElement>('#gamma'),
  floor: $<HTMLInputElement>('#floor'),
  reduction: $<HTMLSelectElement>('#reduction'),
  thickness: $<HTMLInputElement>('#thickness'),
  smoothing: $<HTMLInputElement>('#smoothing'),
  fill: $<HTMLInputElement>('#fill'),
  rounding: $<HTMLInputElement>('#rounding'),
};
const unitRadios = designForm.elements.namedItem('unit') as RadioNodeList;
/** Lengths shown in the active unit. */
const lengthInputs = {
  width: $<HTMLInputElement>('#width'),
  height: $<HTMLInputElement>('#height'),
  thin: $<HTMLInputElement>('#thin'),
};
const lineControls = $('#line-controls');
const barsControls = $('#bars-controls');
const preview = $('#preview');
const previewSvg = $('#preview-svg');
const thinOverlay = document.querySelector<SVGSVGElement>('#thin-overlay')!;
const dimWidth = $('#dim-width');
const dimHeight = $('#dim-height');
const scaleBar = $('#scale-bar');
const scaleLabel = $('#scale-label');
const thinNote = $('#thin-note');
const sizeHint = $('#size-hint');
const previewPlaceholder = $('#preview-placeholder');
const stencilInfo = $('#stencil-info');
const downloadButton = $<HTMLButtonElement>('#download');
const downloadEditableButton = $<HTMLButtonElement>('#download-editable');
const downloadPngButton = $<HTMLButtonElement>('#download-png');
const whiteBackground = $<HTMLInputElement>('#png-white');
const pngError = $('#png-error');

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
    silence();
  }
  const redraw = next.phase !== state.phase || viewOf(next) !== viewOf(state);
  state = next;
  render();
  if (redraw) drawWaveform();
}

const viewOf = (s: State) => (s.phase === 'ready' ? s.edit.view : undefined);

/** Change the ready Source's editing state; a no-op in any other phase. */
function updateEditing(change: (edit: Editing, source: Source) => Partial<Editing>) {
  if (state.phase !== 'ready') return;
  setState({ ...state, edit: { ...state.edit, ...change(state.edit, state.source) } });
}

/** Replace the Selection, remembering the old one for Undo. */
function select(selection: Selection | null, before = currentSelection()) {
  updateEditing(({ undo }) => ({ selection, undo: [...undo, before] }));
  restartLoop();
}

const currentSelection = () => (state.phase === 'ready' ? state.edit.selection : null);

const sameSelection = (a: Selection | null, b: Selection | null) =>
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
    setState({
      phase: 'ready',
      fileName: file.name,
      source,
      edit: { selection: null, view: wholeOf(source), undo: [], playing: false },
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
  updateEditing(() => ({ selection }));
});

function endDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { before } = drag;
  drag = undefined;
  const after = currentSelection();
  if (e.type === 'pointercancel') updateEditing(() => ({ selection: before }));
  else if (!sameSelection(before, after)) select(after, before);
}
waveform.addEventListener('pointerup', endDrag);
waveform.addEventListener('pointercancel', endDrag);

// Keyboard: arrows nudge the focused handle, Shift for a bigger step.
const NUDGE_SECONDS = 0.01;
const SHIFT_NUDGE_SECONDS = 0.1;

for (const [edge, handle] of Object.entries(handles) as ['start' | 'end', HTMLElement][]) {
  handle.addEventListener('keydown', (e) => {
    const selection = currentSelection();
    if (state.phase !== 'ready' || !selection) return;
    const step = Math.round(state.source.sampleRate * (e.shiftKey ? SHIFT_NUDGE_SECONDS : NUDGE_SECONDS));
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
    if (!sameSelection(next, selection)) select(next);
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

tightenButton.addEventListener('click', () => {
  const selection = currentSelection();
  if (state.phase !== 'ready' || !selection) return;
  const next = tighten(state.source.samples, state.source.sampleRate, selection, {
    thresholdDb: numberFrom(thresholdInput, DEFAULT_TIGHTEN_THRESHOLD_DB),
  });
  if (!sameSelection(next, selection)) select(next);
});

/** A number input's value clamped to its range, or the fallback when it is empty. */
function numberFrom(input: HTMLInputElement, fallback: number): number {
  const value = input.valueAsNumber;
  const [min, max] = [Number(input.min), Number(input.max)];
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

// Units: the Print Size and Thin Spot threshold are shown in cm or inches but
// kept in mm, so switching units never nudges them by rounding.

const UNIT_KEY = 'soundstencil.unit';

/** The remembered unit, or the locale's. Storage may be missing or blocked. */
function initialUnit(): Unit {
  try {
    const stored = localStorage.getItem(UNIT_KEY);
    if (stored === 'cm' || stored === 'in') return stored;
  } catch {
    // Fall through to the locale.
  }
  return defaultUnit(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

let unit = initialUnit();

interface Length {
  input: HTMLInputElement;
  mm: number;
  min: number;
  max: number;
  /** Decimals shown, and so the input's step, per unit. */
  places: Record<Unit, number>;
}

/** Each length in mm, with its range; inputs show them in the active unit. */
const lengths: Record<keyof typeof lengthInputs, Length> = {
  width: { input: lengthInputs.width, mm: DEFAULT_PRINT_SIZE.widthMm, min: 10, max: 500, places: { cm: 2, in: 2 } },
  height: { input: lengthInputs.height, mm: DEFAULT_PRINT_SIZE.heightMm, min: 5, max: 300, places: { cm: 2, in: 2 } },
  // Finer: the threshold is around a millimetre, 0.039 in.
  thin: { input: lengthInputs.thin, mm: DEFAULT_THIN_SPOT_MM, min: 0, max: 5, places: { cm: 2, in: 3 } },
};

/**
 * Show every length in the active unit. The step is the shown precision and
 * the range is rounded outward to it, so every shown value is on a step.
 */
function showLengths() {
  for (const { input, mm: value, min, max, places } of Object.values(lengths)) {
    const step = 10 ** -places[unit];
    input.step = String(step);
    input.min = String(roundTo(Math.floor(fromMm(min, unit) / step) * step, places[unit]));
    input.max = String(roundTo(Math.ceil(fromMm(max, unit) / step) * step, places[unit]));
    input.value = String(roundTo(fromMm(value, unit), places[unit]));
  }
  for (const label of designForm.querySelectorAll('.unit')) label.textContent = unit;
  for (const radio of unitRadios) (radio as HTMLInputElement).checked = (radio as HTMLInputElement).value === unit;
}

for (const length of Object.values(lengths)) {
  const { input } = length;
  // Runs before the form's own input listener re-renders.
  input.addEventListener('input', () => {
    const value = input.valueAsNumber;
    if (Number.isFinite(value)) length.mm = clamp(toMm(value, unit), length.min, length.max);
  });
  // Show the clamped value once the user is done typing.
  input.addEventListener('change', showLengths);
}

for (const radio of unitRadios) {
  radio.addEventListener('change', () => {
    unit = unitRadios.value === 'in' ? 'in' : 'cm';
    try {
      localStorage.setItem(UNIT_KEY, unit);
    } catch {
      // Not remembered this time; everything else still works.
    }
    showLengths();
    // The form's input listener already rendered, before this change event.
    render();
  });
}

/** The design controls as the core takes them: fractions, and mm. */
function design(): Design {
  const { count, gamma, floor, reduction, thickness, smoothing, fill, rounding } = designInputs;
  return {
    style: styleRadios.value === 'bars' ? 'bars' : 'line',
    count: numberFrom(count, DEFAULT_BUCKETS),
    gamma: numberFrom(gamma, DEFAULT_GAMMA),
    floorMm: numberFrom(floor, DEFAULT_FLOOR_MM),
    reduction: reduction.value === 'rms' ? 'rms' : 'peak',
    thicknessMm: numberFrom(thickness, DEFAULT_THICKNESS_MM),
    smoothing: numberFrom(smoothing, DEFAULT_SMOOTHING * 100) / 100,
    fillRatio: numberFrom(fill, DEFAULT_FILL_RATIO * 100) / 100,
    rounding: numberFrom(rounding, DEFAULT_ROUNDING * 100) / 100,
    printSize: { widthMm: lengths.width.mm, heightMm: lengths.height.mm },
  };
}

let lastStencil: { source: Source; selection: Selection; design: string; stencil: Stencil } | undefined;

/**
 * The Stencil for the current Selection and controls, if there is a Selection.
 * Remembered, since render() runs on every pointermove and most don't change it.
 */
function currentStencil(): Stencil | undefined {
  const selection = currentSelection();
  if (state.phase !== 'ready' || !selection) return undefined;
  const { source } = state;
  const settings = design();
  const key = JSON.stringify(settings);
  if (
    lastStencil?.source !== source ||
    !sameSelection(lastStencil.selection, selection) ||
    lastStencil.design !== key
  ) {
    lastStencil = { source, selection, design: key, stencil: drawStencil(source.samples, selection, settings) };
  }
  return lastStencil.stencil;
}

let lastThinSpots: { stencil: Stencil; thresholdMm: number; spots: ThinSpot[] } | undefined;

/** The Stencil's Thin Spots at the current threshold, remembered like the Stencil. */
function currentThinSpots(stencil: Stencil): ThinSpot[] {
  const thresholdMm = lengths.thin.mm;
  if (lastThinSpots?.stencil !== stencil || lastThinSpots.thresholdMm !== thresholdMm) {
    lastThinSpots = { stencil, thresholdMm, spots: thinSpots(stencil.ink, thresholdMm) };
  }
  return lastThinSpots.spots;
}

designForm.addEventListener('input', render);
designForm.addEventListener('submit', (e) => e.preventDefault());

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Some browsers start the download well after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const downloadSvg = ({ svg, fileName }: SvgFile) =>
  download(new Blob([svg], { type: 'image/svg+xml' }), fileName);

/** The Stencil SVG as a PNG at 600 DPI of Print Size, DPI written in. */
async function rasterize({ d, printSize }: Stencil, white: boolean): Promise<Uint8Array<ArrayBuffer>> {
  const pixels = pngPixels(printSize);
  const url = URL.createObjectURL(new Blob([rasterSvg(d, printSize, pixels, white)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    // Null past the browser's canvas limit (iOS Safari: about 16.7 megapixels).
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas too large');
    context.drawImage(image, 0, 0, pixels.width, pixels.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Canvas too large to encode');
    return withDpi(new Uint8Array(await blob.arrayBuffer()), PNG_DPI);
  } finally {
    URL.revokeObjectURL(url);
  }
}

downloadButton.addEventListener('click', () => {
  const stencil = currentStencil();
  if (stencil) downloadSvg(stencil);
});

downloadEditableButton.addEventListener('click', () => {
  const stencil = currentStencil();
  if (stencil?.style === 'line') downloadSvg(stencil.editable);
});

downloadPngButton.addEventListener('click', async () => {
  const stencil = currentStencil();
  if (!stencil) return;
  downloadPngButton.disabled = true;
  pngError.hidden = true;
  try {
    const png = await rasterize(stencil, whiteBackground.checked);
    download(new Blob([png], { type: 'image/png' }), pngFileName(stencil.style, stencil.printSize));
  } catch {
    // Almost always a canvas size limit, which varies by browser.
    pngError.textContent = 'Could not make the PNG. Try a smaller Print Size, or use the SVG.';
    pngError.hidden = false;
  } finally {
    schedulePreview();
  }
});

undoButton.addEventListener('click', () => {
  updateEditing(({ undo }) => ({ selection: undo.at(-1) ?? null, undo: undo.slice(0, -1) }));
  restartLoop();
});

/** Fraction of the Selection's length shown either side of it when zoomed. */
const ZOOM_MARGIN = 0.25;

zoomButton.addEventListener('click', () => {
  updateEditing(({ selection, view }, source) => {
    if (!selection || isZoomed(view, source)) return { view: wholeOf(source) };
    const margin = Math.ceil((selection.end - selection.start) * ZOOM_MARGIN);
    return {
      view: {
        start: Math.max(0, selection.start - margin),
        end: Math.min(source.samples.length, selection.end + margin),
      },
    };
  });
});

const wholeOf = (source: Source): SampleRange => ({ start: 0, end: source.samples.length });

const isZoomed = (view: SampleRange, source: Source) =>
  view.start > 0 || view.end < source.samples.length;

// Loop playback of the Selection. One AudioContext for the page, created on the
// first press because browsers (iOS Safari especially) only start audio from a
// user gesture. A change to the Selection restarts the loop from its new start.

let audio: AudioContext | undefined;
let loop:
  | { node: AudioBufferSourceNode; startedAt: number; selection: Selection; frame: number }
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
  updateEditing(() => ({ playing: true }));
  restartLoop();
});

function restartLoop() {
  if (state.phase !== 'ready' || !state.edit.playing || !audio) return;
  const { source } = state;
  const selection = state.edit.selection;
  silence();
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
  loop = { node, startedAt: audio.currentTime, selection, frame: requestAnimationFrame(movePlayhead) };
}

/** Stop the sound and the playhead, leaving `playing` as is for restartLoop(). */
function silence() {
  if (loop) {
    loop.node.stop();
    cancelAnimationFrame(loop.frame);
    playhead.hidden = true;
  }
  loop = undefined;
}

/** Stop playing, as the Stop button does. */
function stopLoop() {
  silence();
  if (state.phase === 'ready' && state.edit.playing) updateEditing(() => ({ playing: false }));
}

function movePlayhead() {
  if (!loop || !audio || state.phase !== 'ready') return;
  const { sampleRate } = state.source;
  const length = loop.selection.end - loop.selection.start;
  const elapsed = Math.max(0, (audio.currentTime - loop.startedAt) * sampleRate);
  placeAt(playhead, loop.selection.start + (elapsed % length));
  loop.frame = requestAnimationFrame(movePlayhead);
}

/** Where a Source sample falls across the view: 0 at its left edge, 1 at its right. */
function viewFraction(sample: number): number {
  if (state.phase !== 'ready') return 0;
  const { view } = state.edit;
  return (sample - view.start) / (view.end - view.start);
}

/** Put an element's left edge at a Source sample; hide it outside the view. */
function placeAt(element: HTMLElement, sample: number) {
  const fraction = viewFraction(sample);
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
  renderControls();
  schedulePreview();
}

/** The markup in the preview, so an unchanged Stencil isn't re-parsed. */
let shownSvg = '';

const PERCENT_INPUTS = new Set(['fill', 'rounding', 'smoothing']);

/** The design controls: cheap, so drawn straight away. */
function renderControls() {
  for (const output of designForm.querySelectorAll('output')) {
    const input = designInputs[output.htmlFor.value as keyof typeof designInputs];
    output.value = PERCENT_INPUTS.has(input.id) ? `${input.value}%` : input.value;
  }
  const line = styleRadios.value !== 'bars';
  lineControls.hidden = !line;
  barsControls.hidden = line;
  downloadEditableButton.hidden = !line;
}

// The Line Style's outline takes a noticeable fraction of a second at large
// sizes, so the preview redraws at most once a frame however fast input comes.
let previewFrame: number | undefined;

function schedulePreview() {
  previewFrame ??= requestAnimationFrame(() => {
    previewFrame = undefined;
    renderPreview();
  });
}

function renderPreview() {
  const stencil = currentStencil();
  preview.hidden = !stencil;
  previewPlaceholder.hidden = !!stencil;
  downloadButton.disabled = !stencil;
  downloadEditableButton.disabled = stencil?.style !== 'line';
  downloadPngButton.disabled = !stencil;
  // Our own markup, built from numbers only.
  const svg = stencil?.svg ?? '';
  if (svg !== shownSvg) previewSvg.innerHTML = shownSvg = svg;
  renderMeasurements(stencil);
  stencilInfo.textContent = !stencil
    ? ''
    : stencil.style === 'bars'
      ? `Bars ${mm(stencil.geometry.barWidthMm)} mm wide, ${mm(stencil.geometry.gapMm)} mm apart`
      : `Line ${mm(stencil.thicknessMm)} mm thick`;
}

/**
 * Dimension labels, the scale bar, Thin Spots, and the print check. The
 * preview is not true size (CSS units aren't physical), so the scale bar is
 * drawn at the preview's scale, and true size is checked on paper.
 */
function renderMeasurements(stencil: Stencil | undefined) {
  const [widthMm, heightMm] = [lengths.width.mm, lengths.height.mm];
  const [width, height] = [formatLength(widthMm, unit), formatLength(heightMm, unit)];
  dimWidth.textContent = width;
  dimHeight.textContent = height;
  previewSvg.setAttribute('aria-label', `Stencil preview, ${width} wide and ${height} tall`);
  // Left out when it wouldn't fit: a design narrower than half an inch.
  const scaleMm = scaleBarMm(unit);
  scaleBar.parentElement!.hidden = scaleMm > widthMm;
  scaleBar.style.width = `${(scaleMm / widthMm) * 100}%`;
  scaleLabel.textContent = formatLength(scaleMm, unit);
  sizeHint.textContent = stencil
    ? `Check size: print the SVG or PNG at 100% (turn off "fit to page"). It should measure ${width} wide.`
    : '';

  const spots = stencil ? currentThinSpots(stencil) : [];
  thinOverlay.setAttribute('viewBox', `0 0 ${mm(widthMm)} ${mm(heightMm)}`);
  // An outline around each spot, a little bigger than it so thin ones still show.
  const pad = 0.4;
  thinOverlay.innerHTML = spots
    .map(({ box: { x, y, width: w, height: h } }) =>
      `<rect x="${mm(x - pad)}" y="${mm(y - pad)}" width="${mm(w + 2 * pad)}" height="${mm(h + 2 * pad)}" rx="${pad}"/>`,
    )
    .join('');
  thinNote.hidden = spots.length === 0;
  thinNote.textContent = stencil && spots.length ? thinSpotNote(spots, stencil.style) : '';
}

/** What gives each kind of Thin Spot more room, per Style. */
const THIN_SPOT_FIXES: Record<StyleName, Record<ThinSpot['kind'], string>> = {
  line: { ink: 'a thicker line', gap: 'fewer Buckets, a thinner line, or a wider Print Size' },
  bars: { ink: 'more Fill, fewer Buckets, or a wider Print Size', gap: 'less Fill, fewer Buckets, or a wider Print Size' },
};

function thinSpotNote(spots: ThinSpot[], style: StyleName): string {
  // As precise as the threshold input shows it.
  const threshold = formatLength(lengths.thin.mm, unit, lengths.thin.places[unit]);
  const gaps = spots.filter((s) => s.kind === 'gap').length;
  const thin = spots.length - gaps;
  const parts = [
    thin && `${thin} ${thin === 1 ? 'part' : 'parts'} thinner than ${threshold}`,
    gaps && `${gaps} ${gaps === 1 ? 'gap' : 'gaps'} narrower than ${threshold}`,
  ].filter(Boolean);
  const fixes = [...new Set(spots.map((s) => THIN_SPOT_FIXES[style][s.kind]))];
  return (
    `Thin Spots, outlined in red: ${parts.join(' and ')}. ` +
    'Fine detail can blur or fade as a tattoo heals and ages. ' +
    `For more room, try ${fixes.join('; or ')}. Export still works.`
  );
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
    const left = clamp(viewFraction(selection.start), 0, 1);
    const right = clamp(viewFraction(selection.end), 0, 1);
    selectionBox.hidden = right <= left;
    selectionBox.style.left = `${left * 100}%`;
    selectionBox.style.width = `${(right - left) * 100}%`;
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

showLengths();
new ResizeObserver(drawWaveform).observe(canvas);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawWaveform);
render();
