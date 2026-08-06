# AGENTS.md

## Project overview

Pokédex is a single-page web app (Vite + React 18 + TypeScript). It fetches data
from the public [PokéAPI](https://pokeapi.co/) (`https://pokeapi.co/api/v2`) — no API
key or backend of our own is required. There is only one service to run: the Vite
dev server.

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
- The app calls PokéAPI directly from the browser, so testing requires outbound
  network access to `https://pokeapi.co`. If searches fail with a network error,
  check egress rather than the app code.
- CSS files are imported as side-effects in `.tsx`; `src/vite-env.d.ts`
  (`/// <reference types="vite/client" />`) provides those module declarations.
  Removing it breaks `tsc`/`pnpm build` even though the dev server still works.
- The Vite dev server is configured with `host: true` on port `5173` so it is
  reachable from the VM's browser.
