# AGENTS.md

## Project overview

This is a **Pokémon TCG (trading card) collection tracker** — a single-page web app
(Vite + React 18 + TypeScript). It searches real cards and prices from the public
[Pokémon TCG API](https://pokemontcg.io/) (`https://api.pokemontcg.io/v2`) — no API
key is required for basic/low-volume use. The collection itself is stored in the
browser via `localStorage` (key `pokedex.collection.v1`); there is no backend or
database of our own. There is only one service to run: the Vite dev server.

Key modules: `src/tcgapi.ts` (card search + price extraction),
`src/collection.ts` (condition grades, condition-based value math, and
localStorage persistence), and `src/ebay.ts` (highest eBay sold comps in the
last 30 days via PriceCharting). This app is about physical trading cards, not the
video game — do not reintroduce PokéAPI/video-game data.

Standard commands live in `package.json` scripts and `README.md`; use those rather
than duplicating them here.

- Install: `pnpm install`
- Run (dev): `pnpm dev` (serves at `http://localhost:5173`)
- Lint: `pnpm lint`
- Type-check + build: `pnpm build`

## Cursor Cloud specific instructions

- Package manager is **pnpm** (see `pnpm-lock.yaml`). Use pnpm, not npm/yarn.
- The pnpm version is pinned to `10.33.3` via the `packageManager` field in
  `package.json`; the VM ships this version through a corepack shim. Do NOT run
  `corepack enable pnpm` without that pin present — an unpinned corepack pulls the
  latest pnpm (11.x), which ignores `pnpm.onlyBuiltDependencies` and aborts trying
  to purge the pnpm-10 `node_modules` in a non-TTY shell.
- pnpm 10 blocks dependency build scripts by default. `esbuild` (required by Vite)
  is explicitly allowlisted via `pnpm.onlyBuiltDependencies` in `package.json`, so
  a plain `pnpm install` runs its postinstall automatically. Do not run the
  interactive `pnpm approve-builds`.
- The app calls card APIs from the browser: English → `https://api.pokemontcg.io`,
  Asian langs → `https://api.tcgdex.net` (and `assets.tcgdex.net` for images).
  If searches fail with a network error, check egress rather than the app code.
- eBay 30-day highs (`src/ebay.ts`) read PriceCharting completed sales. In
  `pnpm dev` / `pnpm preview`, prefer the Vite middleware at `/api/ebay-high`
  (`ebayProxyPlugin.ts`), which fetches PriceCharting directly. On static
  GitHub Pages the client falls back to the CORS-friendly `r.jina.ai` page
  mirror — no API key. Prefer matching PSA titles when the line is slabbed;
  otherwise prefer raw (non-slab) comps, then fall back to any sale in-window.
- Asian card ids are stored as `tcgdex:<lang>:<id>` (e.g. `tcgdex:ja:SV2a-025`)
  so they never collide with English pokemontcg.io ids. `fetchCardById` routes
  on that prefix.
- Use the quoted Lucene query form `name:"<query>"` against the TCG API. The bare
  wildcard form (`name:charizard*`) intermittently returns HTTP 500 from the
  upstream API; the quoted form does token "contains" matching. Card number
  search uses `number:"<n>"` (optional leading `#` stripped); pair with
  `set.id:` when possible because numbers repeat across sets.
- The TCG API (behind Cloudflare) is genuinely flaky — it randomly returns HTTP
  500 for perfectly valid requests (~1/3 of calls during testing), independent of
  query params. `searchCards` retries transient 500s/429s/network errors a few
  times with backoff (`fetchWithRetry`). Do not "fix" an occasional 500 by
  rewriting the query — it's upstream instability, and the retry handles it.
- Without an API key the TCG API has a lower daily rate limit. If searches start
  failing with 429/`API key` errors under heavy use, add a key (see pokemontcg.io)
  rather than assuming an app bug.
- Camera scanning (`src/scan.ts` + the `CameraScanner` in `src/App.tsx`) uses
  `navigator.mediaDevices.getUserMedia`, which requires a **secure context**
  (https or localhost). It will not work over plain http (e.g. hitting the dev
  server by LAN IP from a phone) — use the deployed https site for on-phone camera.
  Use `facingMode: { ideal: 'environment' }` with a plain-video fallback; a hard
  `facingMode: 'environment'` constraint commonly fails on iOS. The most reliable
  phone path is the **Take photo** button (`<input capture="environment">`), which
  opens the native camera app. The cloud VM has no physical camera, so getUserMedia
  fails there — test OCR via the file-input path.
- OCR uses `tesseract.js` with **self-hosted** assets under `public/tesseract/`
  (worker, wasm cores, `eng.traineddata.gz`), configured via `createWorker` paths
  so scanning does not depend on the jsDelivr CDN (which the PWA service worker
  can break on phones). Name extraction is best-effort; the UI treats the result
  as a pre-filled search term.
- CSV import (`parseCollectionCsv` / `mergeImportRows` in `src/collection.ts`)
  requires a `Card ID` column. Ship / download the template via
  `collectionTemplateCsv()` or `public/collection-template.csv`.
- Collection persistence (`loadCollectionDetailed` / `saveCollection` in
  `src/collection.ts`) uses `pokedex.collection.v1` plus a last-known-good
  backup key. Never “fix” empty inventory by clearing storage in code paths
  that run on boot. Do not tell users to delete and re-add the iOS home-screen
  icon — that can wipe the PWA’s localStorage; prefer a normal refresh / wait
  for the service worker update.
- CSS files are imported as side-effects in `.tsx`; `src/vite-env.d.ts`
  (`/// <reference types="vite/client" />`) provides those module declarations.
  Removing it breaks `tsc`/`pnpm build` even though the dev server still works.
- The Vite dev server is configured with `host: true` on port `5173` so it is
  reachable from the VM's browser.
