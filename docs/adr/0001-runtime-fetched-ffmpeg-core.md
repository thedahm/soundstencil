# ADR-0001: GPL ffmpeg core is fetched at runtime, never shipped

Date: 2026-09-28
Status: accepted
Source: [spec, issue #1](https://github.com/thedahm/soundstencil/issues/1)

## Context

Most Sources decode natively with `decodeAudioData()`. Some do not (MOV in Firefox is the known case), so a fallback decoder is needed. ffmpeg.wasm is the practical option. Its JS wrapper (`@ffmpeg/ffmpeg`, `@ffmpeg/util`) is MIT, but the wasm binary (`@ffmpeg/core`) is GPL-2.0-or-later. soundstencil is MIT and meant to be forked.

## Decision

1. The tool is MIT-licensed.
2. `@ffmpeg/core` is never vendored, bundled, or self-hosted. The MIT wrapper fetches it at runtime from jsDelivr, pinned to an exact version, via `toBlobURL`, and only after native decode fails.
3. The single-threaded core is used, so the site needs no COOP/COEP headers.
4. The CSP allows exactly that pinned URL and nothing else external. The README states the one fetch plainly: only the codec is downloaded; the Source never leaves the device.

## Consequences

- The repo and deploy ship no GPL code, so forks inherit a clean MIT tree.
- The fallback depends on jsDelivr availability and fails if it is offline or blocked. Acceptable because it is a rare path; the error suggests trying another browser.
- Bumping the core version means updating the pinned URL in two places (loader and CSP). A test should assert they match.
- Self-hosting the core later is allowed but reopens this ADR (source-offer obligations).
