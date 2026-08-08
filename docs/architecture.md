# Architecture overview

```text
┌─────────────────────────────────────────────┐
│                 SwiftUI UI                  │
│  Collection │ Scan │ Detail │ Settings      │
└──────────────┬──────────────┬───────────────┘
               │              │
               ▼              ▼
        SwiftData store   Camera + Vision OCR
        CollectionItem    → CardReferenceStore
               │              │
               └──────┬───────┘
                      ▼
              ValuationProviding
           (manual now / APIs later)
```

## Data flow — add via scan

1. User captures still frame.
2. OCR extracts name / collector number hints.
3. `CardReferenceStore` ranks candidates.
4. User confirms identity + sets quantity/condition.
5. `CollectionItem` + photo persisted.

## Data flow — value (Phase 2)

1. Detail requests estimate for identity + condition bucket.
2. Provider returns amount + source + timestamp.
3. UI shows market estimate separately from manual “My value.”

## Module boundaries

| Module | Owns |
|---|---|
| Features/Collection | List, detail, manual add/edit |
| Features/Scan | Session, shutter, confirm |
| Models | SwiftData schema + enums |
| Services/CardReference | Offline catalog search |
| Services/Valuation | Protocol + providers |

Keep marketplace networking out of Views and out of SwiftData models.
