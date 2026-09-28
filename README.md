# soundstencil

Turn a voice or bark clip into a stencil-ready soundwave tattoo SVG.

Pick a video or audio file, select the sound, choose a style, and export a black-fills-only SVG sized in real millimetres. Everything runs in your browser: the file never leaves your device. No accounts, no analytics.

Status: in development. Spec and tickets in [issue #1](https://github.com/thedahm/soundstencil/issues/1).

Lives at `soundstencil.dominichanzely.com`.

## Develop

```sh
npm ci
npm run dev        # local server
npm test           # Vitest
npm run typecheck  # core (no DOM lib) and ui separately
npm run build      # typecheck + Vite build to dist/
```

`src/core/` is the pure pipeline: no DOM, no browser APIs. `tsconfig.core.json` leaves out the DOM lib so any DOM use there fails to typecheck. `src/ui/` is the only layer that touches the page.

## Privacy

No analytics, no external fonts, no requests to any other origin. The Content-Security-Policy in [`public/_headers`](public/_headers) enforces that: `default-src 'self'`, plus only `blob:` (decoded media, downloads) and `'wasm-unsafe-eval'` (WebAssembly). `curl -I https://soundstencil.dominichanzely.com` shows it.

## Deploy

Cloudflare Workers with static assets and no Worker script, deployed by Workers Builds on push to `main`. Same shape as dominichanzely.com: serving config lives in `wrangler.jsonc`, only the git connection is dashboard state.

| Setting | Value | Lives in |
|---|---|---|
| Production branch | `main` | dashboard |
| Build command | `npm ci && npm run build` | dashboard |
| Deploy command | `npx wrangler deploy` | dashboard |
| Root directory | (repo root) | dashboard |
| Build watch paths | include `src/*`, `public/*`, `index.html`, `package.json`, `package-lock.json`, `tsconfig*.json`, `wrangler.jsonc`, `.node-version` | dashboard |
| Node version | `.node-version` | repo |
| Assets directory | `dist/` | `wrangler.jsonc` |
| Headers (CSP) | `public/_headers`, copied to `dist/` by Vite | repo |
| Custom domain | `soundstencil.dominichanzely.com` | `wrangler.jsonc` |
| `workers.dev` hostname | disabled | `wrangler.jsonc` |

wrangler is pinned in `devDependencies`, so the deploy command uses the locked version. CI (`.github/workflows/ci.yml`) runs tests and the build on every push and PR; it does not deploy.

## License

MIT. See `LICENSE`, and `docs/adr/0001-runtime-fetched-ffmpeg-core.md` for how the GPL ffmpeg fallback is kept out of the distributed code.
