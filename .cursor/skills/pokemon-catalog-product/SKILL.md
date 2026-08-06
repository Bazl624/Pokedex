---
name: pokemon-catalog-product
description: >-
  Defines product scope, MVP, and phasing for the Pokemon collection iOS app
  (catalog, inventory, condition, camera scan, optional market value). Use when
  starting features, cutting scope, writing specs, or deciding raw vs PSA vs
  pricing work.
---

# Pokemon Catalog — Product Scope

This repo (`Bazl624/Pokedex`) is an iOS app to index Corey's Pokemon card collection.

## North star

Own a trustworthy personal catalog of cards: what you have, how many, condition (raw or PSA), photos, and enough identity to look up value later.

## MVP (ship first)

**Catalog + camera capture.** Do not block MVP on live marketplace pricing.

| Capability | MVP |
|---|---|
| Add / edit / delete collection entries | Yes |
| Card identity (name, set, number, variant) | Yes |
| Quantity | Yes |
| Condition: raw grades **or** PSA slab grade | Yes |
| Photo of card (camera or library) | Yes |
| Scan card with camera → suggest identity | Yes (confirm before save) |
| Search / filter / sort collection | Yes |
| Offline-first local persistence | Yes (SwiftData) |
| Live eBay / TCGPlayer / PriceCharting quotes | **No** — Phase 2 |
| Auto-sync across devices / iCloud | Nice-to-have after MVP |
| Trading / social / marketplace selling | Out of scope |

## Condition model (required in MVP)

Every inventory item is either:

1. **Raw** — `RawCondition`: `NM | LP | MP | HP | DMG` (plus optional notes)
2. **Graded** — `GradingCompany`: start with `PSA` (extensible to CGC/BGS later), `grade` as decimal string or enum (`1`…`10`, including half grades if needed), optional `certNumber`

Do not invent a single slider that mixes raw and PSA; keep the type explicit.

## Identity sources

Prefer matching against a **local card reference** (bundled or cached Pokémon TCG API / open datasets) using OCR hints from the scan skill. Manual pick always available when OCR fails.

Canonical identity fields:

- `cardName`
- `setCode` / `setName`
- `collectorNumber`
- `variant` (holo, reverse, full art, illustration rare, etc.)
- optional `tcgDexId` or `pokemonTcgId` for future pricing joins

## Phase 2 — market value

Only after catalog + scan feel solid. See `market-value-integrations`.

- Manual value override always wins for display totals
- Estimated value is labeled with source + as-of date
- Never scrape in violation of ToS; prefer official APIs or user-pasted comps

## Phase 3+ (explicitly later)

- Multi-company grading (CGC, BGS)
- Wishlists / sealed product
- Portfolio charts
- Export CSV / backup
- Watch lists for eBay sold comps

## Agent rules

1. When asked to “build the app,” default to **MVP catalog + scan**, not pricing.
2. Prefer SwiftUI + SwiftData + Vision/AVFoundation on-device.
3. Keep pricing adapters behind a protocol so MVP ships with `ManualValueProvider` only.
4. Every new screen must answer one job: browse, detail, add/edit, or scan.
5. Read sibling skills before implementing:
   - `ios-swiftui-scaffold` — project layout
   - `collection-inventory-model` — data model
   - `pokemon-card-camera-scan` — camera pipeline
   - `ios-xcode-build` — build/test
   - `market-value-integrations` — Phase 2 only

## Acceptance checklist for MVP

- [ ] Add a card manually with identity + quantity + raw or PSA condition
- [ ] Scan a card, confirm match, save to collection
- [ ] Browse, search, and open detail with photo
- [ ] Edit quantity / condition / delete
- [ ] Data survives app relaunch (SwiftData)
- [ ] Works on iPhone Simulator for non-camera paths; camera on device
---

# Decision log (seed)

| Decision | Choice |
|---|---|
| Primary UI | SwiftUI |
| Persistence | SwiftData |
| MVP depth | Catalog, not full market engine |
| Scan | On-device Vision OCR + reference match + human confirm |
| Pricing | Deferred; manual value field allowed in MVP |
