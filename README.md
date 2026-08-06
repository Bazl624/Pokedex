# Pokedex

iOS app to index a personal Pokémon card collection — inventory, condition (raw or PSA), photos, and camera-assisted cataloging.

## Product stance

**MVP = catalog + camera scan.** Live eBay / marketplace pricing is Phase 2. You can still enter a manual dollar value per card in MVP.

See Cursor skills under [`.cursor/skills/`](.cursor/skills/) for agent workflows that implement this app.

| Skill | Use when |
|---|---|
| `pokemon-catalog-product` | Scope, MVP vs later phases |
| `ios-swiftui-scaffold` | App structure, SwiftUI + SwiftData |
| `collection-inventory-model` | Models for quantity, raw vs PSA |
| `pokemon-card-camera-scan` | Camera + Vision OCR + confirm match |
| `market-value-integrations` | Phase 2 pricing adapters |
| `ios-xcode-build` | Build / test / Simulator |

## Planned stack

- SwiftUI, iOS 17+
- SwiftData (offline-first)
- AVFoundation + Vision for on-device scan
- Local card reference match; human confirm before save

## Status

Skill pack and product definition are in-repo. App source scaffolding comes next (invoke `ios-swiftui-scaffold` + `collection-inventory-model`).

## License

Unlicense — see [LICENSE](LICENSE).
