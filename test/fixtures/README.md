# Test fixtures

## `bark.wav`

One dog bark, 0.8 s, mono, 48 kHz, 16-bit PCM. The bark runs from about 0.25 s to 0.65 s with near-silence either side, so later slices can test Selection and Tighten against it. The source recording clips at full scale on the bark's attack (a few dozen samples at ±1.0); that is left in, since phone recordings do the same.

- **Origin:** [File:Ladrido perro.ogg](https://commons.wikimedia.org/wiki/File:Ladrido_perro.ogg) on Wikimedia Commons, by Edo.pt2 (own work, 2026-04-07).
- **License:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) public domain dedication (`{{self|cc-zero}}` on the file page). No attribution required; credited here for provenance.
- **Original:** Ogg Opus, mono, 48 kHz, 3.73 s, three barks. SHA-256 `6646b8ab52930a967d01ec19158185599b4573d0b00507e7da21df89ebafad53`.
- **Derivation:** decoded with macOS `afconvert -f WAVE -d LEI16@48000 -c 1 Ladrido_perro.ogg full.wav`, then samples 0.85 s to 1.65 s (the first bark) copied unchanged into a plain 44-byte-header PCM WAV. No gain, filtering, or resampling.

## `wav.ts`

A minimal 16-bit PCM WAV reader. Node has no `decodeAudioData()`, so tests use this as the Decoder.
