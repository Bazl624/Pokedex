---
name: market-value-integrations
description: >-
  Phase-2 market valuation for Pokemon cards (eBay sold comps, TCGPlayer,
  PriceCharting, PSA population context). Use only when adding pricing,
  portfolio totals, or marketplace adapters — not for MVP catalog work.
---

# Market Value Integrations (Phase 2)

## When to use

Only after MVP catalog + scan work. If the task is inventory or camera, prefer other skills and keep valuation as manual/`nil`.

## Product rules

1. **Manual value always wins** for “My collection value.”
2. Estimated quotes must show **source** and **as-of** timestamp.
3. Label uncertainty: raw NM comps ≠ PSA 10 comps — never mix without stating grade bucket.
4. No opaque scraping that violates platform ToS. Prefer:
   - Official / licensed APIs where available
   - User-exported CSVs
   - Explicit user-initiated lookups with caching
5. Cache aggressively; do not hammer marketplaces from the phone on every list scroll.

## Architecture

```swift
protocol ValuationProviding: Sendable {
    var sourceName: String { get }
    func estimate(for query: ValuationQuery) async throws -> ValuationEstimate?
}

struct ValuationQuery: Sendable {
    var referenceCardId: String?
    var cardName: String
    var setCode: String?
    var collectorNumber: String
    var variant: String?
    var conditionKind: ConditionKind
    var rawCondition: RawCondition?
    var gradingCompany: GradingCompany?
    var grade: String?
}

struct ValuationEstimate: Sendable {
    var amountUSD: Decimal
    var currency: String // "USD"
    var sourceName: String
    var observedAt: Date
    var notes: String?
}
```

MVP ships `ManualValuationProvider` (reads `manualValueUSD` only).

Phase 2 candidates (choose based on API access Corey can obtain):

| Source | Fits |
|---|---|
| TCGPlayer / Pokémon price APIs | Raw singles |
| eBay Browse / fulfilled sold comps | Raw + PSA (filter titles carefully) |
| PriceCharting | Graded-friendly historical |
| PSA cert lookup | Validate cert + grade (not price itself) |

## eBay / PSA title heuristics (guidance)

When parsing sold listings:

- Require set or collector number when possible
- Separate buckets: `PSA 10`, `PSA 9`, raw `NM`, etc.
- Strip lot spam (“pack fresh”, “investment”, multi-card lots)
- Prefer sold/completed comps over active ask

## UI

- Detail screen: “My value” (manual edit) + “Market estimate” (refresh button)
- Collection total: toggle My value vs Market estimate
- Offline: show last cached estimate; never block catalog use

## Safety

- Store API keys in Keychain or Xcode Secrets — never in git or skill text
- Log valuation failures softly; catalog remains usable

## Related skills

- `collection-inventory-model` — fields to write
- `pokemon-catalog-product` — phase gates
