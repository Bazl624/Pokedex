---
name: collection-inventory-model
description: >-
  Define and evolve SwiftData models for Pokemon collection inventory: card
  identity, quantity, raw condition, PSA grading, photos, and optional manual
  value. Use when adding models, migrations, list queries, or edit forms.
paths:
  - "**/Models/**"
  - "**/*CollectionItem*"
  - "**/*Condition*"
  - "**/*Grading*"
---

# Collection Inventory Model

## Core entity: `CollectionItem`

One row = one owned lot (same identity + same condition). If Corey has two copies in different conditions, store two items (or later support per-copy rows — start simple).

### Required fields

| Field | Type | Notes |
|---|---|---|
| `id` | `UUID` | Stable |
| `createdAt` / `updatedAt` | `Date` | |
| `quantity` | `Int` | ≥ 1 |
| `cardName` | `String` | Display name |
| `setName` | `String` | |
| `setCode` | `String?` | |
| `collectorNumber` | `String` | Keep as string (`025`, `TG01`) |
| `variant` | `String?` | holo, reverse, etc. |
| `referenceCardId` | `String?` | External/local catalog id |
| `finish` | enum/string optional | |
| `conditionKind` | enum | `.raw` or `.graded` |
| `rawCondition` | enum? | Required if raw |
| `gradingCompany` | enum? | Start: `.psa` |
| `grade` | `String?` | e.g. `10`, `9.5` |
| `certNumber` | `String?` | PSA cert |
| `notes` | `String?` | |
| `photoPath` | `String?` | Relative path in app container |
| `manualValueUSD` | `Decimal?` | Optional MVP value override |
| `estimatedValueUSD` | `Decimal?` | Phase 2 filled by providers |
| `estimatedValueAsOf` | `Date?` | |
| `estimatedValueSource` | `String?` | |

### Raw condition enum

```swift
enum RawCondition: String, Codable, CaseIterable {
    case nearMint = "NM"
    case lightlyPlayed = "LP"
    case moderatelyPlayed = "MP"
    case heavilyPlayed = "HP"
    case damaged = "DMG"
}
```

### Graded

```swift
enum GradingCompany: String, Codable, CaseIterable {
    case psa = "PSA"
    // future: cgc, bgs
}
```

Validation: if `conditionKind == .graded`, require `gradingCompany` + `grade`. If `.raw`, require `rawCondition`.

## Queries the UI needs

- All items sorted by `updatedAt` desc
- Search: name, set, collector number, cert number
- Filter: raw vs graded, set, PSA 10 only, missing photo
- Aggregate: total quantity; sum of `manualValueUSD` (and later estimated)

## Migration stance

- Start with a single SwiftData schema version
- Prefer additive optional fields over destructive renames
- When changing enums, keep raw string storage compatible

## Display helpers

- Title: `"{cardName} · {collectorNumber}"`
- Subtitle: set + condition badge (`NM` or `PSA 10`)
- Never show estimated market $ without source + date once Phase 2 lands
- If both manual and estimated exist, prefer **manual** for “My value”

## Anti-patterns

- One mega “condition score” for both raw and PSA
- Storing only photos without structured identity
- Deduplicating away different conditions into a single quantity blindly

## Related skills

- `pokemon-catalog-product`
- `pokemon-card-camera-scan`
- `market-value-integrations`
