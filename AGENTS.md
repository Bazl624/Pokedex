# AGENTS.md

## Project overview

This is a **Pokémon TCG (trading card) collection tracker** — a single-page web app
(Vite + React 18 + TypeScript). It searches real cards and prices from the public
[Pokémon TCG API](https://pokemontcg.io/) (`https://api.pokemontcg.io/v2`) — no API
key is required for basic/low-volume use. The collection itself is stored in the
browser via `localStorage` (key `pokedex.collection.v1`); there is no backend or
database of our own. There is only one service to run: the Vite dev server.

Key modules: `src/tcgapi.ts` (card search + price extraction) and
`src/collection.ts` (condition grades, condition-based value math, and
localStorage persistence). This app is about physical trading cards, not the
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
- The app calls the Pokémon TCG API directly from the browser, so testing requires
  outbound network access to `https://api.pokemontcg.io`. If searches fail with a
  network error, check egress rather than the app code.
- Use the quoted Lucene query form `name:"<query>"` against the TCG API. The bare
  wildcard form (`name:charizard*`) intermittently returns HTTP 500 from the
  upstream API; the quoted form is reliable and does token "contains" matching.
- Without an API key the TCG API has a lower daily rate limit. If searches start
  failing with 429/`API key` errors under heavy use, add a key (see pokemontcg.io)
  rather than assuming an app bug.
- CSS files are imported as side-effects in `.tsx`; `src/vite-env.d.ts`
  (`/// <reference types="vite/client" />`) provides those module declarations.
  Removing it breaks `tsc`/`pnpm build` even though the dev server still works.
- The Vite dev server is configured with `host: true` on port `5173` so it is
  reachable from the VM's browser.
