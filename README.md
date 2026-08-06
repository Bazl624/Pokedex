# Pokédex

A small, modern Pokédex web app. Search for any Pokémon by name or number and see
its artwork, types, height/weight, and base stats. Data comes from the free public
[PokéAPI](https://pokeapi.co/) — no API key required.

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
  App.tsx            # UI: search form + Pokémon card
  App.css            # component styles
  index.css          # global styles
  pokeapi.ts         # PokéAPI client + types
```
