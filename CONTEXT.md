# soundstencil

Turns a short sound (a dog's bark, a voice) pulled from a video or audio file into a stencil-ready soundwave tattoo, entirely on the user's device. Decisions live in `docs/adr/`; the spec is [issue #1](https://github.com/thedahm/soundstencil/issues/1).

## Language

### Sound

**Source**:
The video or audio file the user picks, decoded in the browser to mono samples (channels averaged). Never uploaded.
_Avoid_: upload, input, recording

**Selection**:
The user-chosen time range of the Source that becomes the tattoo. Only the Selection feeds the Stencil.
_Avoid_: clip, region, trim

**Tighten**:
The explicit, undoable action that moves Selection edges inward to where the sound rises above a threshold relative to the Selection's own peak (the loudest short-window RMS, not the loudest sample). Never automatic.
_Avoid_: auto-trim, auto-crop

**Bucket**:
One of N equal time slices of the Selection, reduced to a single loudness value (peak by default, RMS optional). N is shared by every Style.
_Avoid_: bin, sample, bar (a bar is a drawn shape, a Bucket is data)

**Compression**:
The power curve applied to Bucket loudness before drawing, lifting quiet Buckets relative to loud ones. Paired with a minimum height floor.
_Avoid_: gain, normalization

### Drawing

**Style**:
How Buckets become shapes. v1 has two:
- **Line** (default): a smoothed curve through Bucket loudness with alternating sign, the "heartbeat" oscillation.
- **Bars**: one mirrored, rounded bar per Bucket.
_Avoid_: theme, mode

**Print Size**:
The physical width and max height the design is made for, in mm internally, shown in cm or inches. The loudest Bucket reaches max height. Every other physical measurement derives from it.
_Avoid_: canvas size, resolution

**Thin Spot**:
Any bar, gap, or line segment narrower at Print Size than the Thin Spot threshold (default 1.0mm). Advisory only: highlighted, never blocks export.
_Avoid_: error, violation, minimum

### Output

**Stencil SVG**:
The primary export: black fills only, one compound path, no strokes, sized in mm at Print Size. What a tattoo artist can print or trace directly.
_Avoid_: vector, outline

**Editable SVG**:
The Line Style's secondary export: the raw centerline as a stroke, for an artist who wants to restyle it. Not stencil-ready.
_Avoid_: source SVG, raw export
