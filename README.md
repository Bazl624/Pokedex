# Pokémon TCG Card Collection

A small, modern web app for tracking your **Pokémon trading card** collection.
Search real cards, record the ones you own along with their **condition**, and see
an estimated total **value** of your collection. Card data and prices come from the
free public [Pokémon TCG API](https://pokemontcg.io/) — no API key required for
basic use.

## Features

- Search the Pokémon TCG catalog by card name (real images, sets, rarity).
- **Scan a card with your camera**: point your phone at a card, and the app reads
  the card name (on-device OCR) and searches for it automatically. On phones you
  can also use **Take photo** (opens the native camera). Camera needs an
  https/secure connection — it works on the deployed site and on localhost.
- See each card's market price (USD). Cancel an in-flight search with **Cancel**.
- Add cards to your collection with a condition grade (NM / LP / MP / HP / DMG)
  and quantity.
- Mark **PSA grades** (1–10) on collection lines; estimated value switches to
  PSA multipliers. Raw cards get a **worth grading?** tip (PSA 10 estimate vs
  typical fees).
- Automatic estimated value per card and a running total for the whole collection,
  adjusted for condition / PSA.
- **Export / Import CSV**: download your inventory, or import one. Use
  **CSV template** on the My collection tab for the expected columns
  (`Card ID` + `Condition` required; optional `PSA Grade`; see
  `public/collection-template.csv`).
- Your collection is saved locally in the browser (localStorage), so it persists
  between visits on the same device.

## Tech stack

- [Vite](https://vite.dev/) (dev server + build)
- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [ESLint](https://eslint.org/) for linting

## Getting started

Requires Node.js 20+ and [pnpm](https://pnpm.io/).

```bash
pnpm install      # install dependencies
pnpm dev          # start the dev server at http://localhost:5173
```

## Available scripts

| Command          | Description                                        |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | Start the Vite dev server (hot reload).            |
| `pnpm build`     | Type-check and build the production bundle to `dist/`. |
| `pnpm preview`   | Serve the production build locally.                |
| `pnpm lint`      | Run ESLint over the project.                       |
| `pnpm typecheck` | Run the TypeScript type checker without emitting.  |

## Project structure

```
index.html          # Vite entry HTML
public/pokeball.svg  # favicon / logo
src/
  main.tsx           # React entry point
  App.tsx            # UI: tabs for Search + My Collection
  App.css            # component styles
  index.css          # global styles
  tcgapi.ts          # Pokémon TCG API client + Card type
  collection.ts      # collection model: conditions, values, localStorage
```

## Notes on values

Prices are the Near Mint market price from the TCG API, adjusted by a rough
condition multiplier (NM 100%, LP 85%, MP 70%, HP 50%, DMG 30%). These are
ballpark estimates; real market prices vary by grade, edition, and marketplace.
