import type { Card } from './tcgapi'

/** Card condition grades, best to worst. */
export const CONDITIONS = [
  'NM', // Near Mint
  'LP', // Lightly Played
  'MP', // Moderately Played
  'HP', // Heavily Played
  'DMG', // Damaged
] as const

export type Condition = (typeof CONDITIONS)[number]

export const CONDITION_LABELS: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
}

/**
 * Rough value multipliers applied to a card's Near Mint market price to
 * estimate its worth in a given condition. These are approximate, market
 * conventions vary, but they give collectors a sensible ballpark.
 */
export const CONDITION_MULTIPLIERS: Record<Condition, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.7,
  HP: 0.5,
  DMG: 0.3,
}

export interface CollectionItem {
  /** Unique per (card + condition) so the same card can be held in two grades. */
  key: string
  card: Card
  condition: Condition
  quantity: number
}

const STORAGE_KEY = 'pokedex.collection.v1'

export function itemKey(cardId: string, condition: Condition): string {
  return `${cardId}::${condition}`
}

/** Estimated value of a single line item (NM price × condition × quantity). */
export function itemValue(item: CollectionItem): number {
  if (item.card.marketPrice == null) return 0
  return item.card.marketPrice * CONDITION_MULTIPLIERS[item.condition] * item.quantity
}

export function totalValue(items: CollectionItem[]): number {
  return items.reduce((sum, item) => sum + itemValue(item), 0)
}

export function totalCards(items: CollectionItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

export function loadCollection(): CollectionItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CollectionItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCollection(items: CollectionItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore write failures (e.g. private mode / storage full).
  }
}

/** Add one copy of a card in a given condition, merging with any existing line. */
export function addToCollection(
  items: CollectionItem[],
  card: Card,
  condition: Condition,
): CollectionItem[] {
  const key = itemKey(card.id, condition)
  const existing = items.find((i) => i.key === key)
  if (existing) {
    return items.map((i) =>
      i.key === key ? { ...i, quantity: i.quantity + 1 } : i,
    )
  }
  return [...items, { key, card, condition, quantity: 1 }]
}

export function setQuantity(
  items: CollectionItem[],
  key: string,
  quantity: number,
): CollectionItem[] {
  if (quantity <= 0) {
    return items.filter((i) => i.key !== key)
  }
  return items.map((i) => (i.key === key ? { ...i, quantity } : i))
}

export function removeItem(items: CollectionItem[], key: string): CollectionItem[] {
  return items.filter((i) => i.key !== key)
}

/** Escape a value for CSV (RFC 4180): quote if it contains comma/quote/newline. */
function csvField(value: string | number): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Serialize the collection to CSV text (one row per card+condition line).
 * A UTF-8 BOM is prepended by the caller so spreadsheets read accents (é) right.
 */
export function collectionToCsv(items: CollectionItem[]): string {
  const headers = [
    'Name',
    'Set',
    'Number',
    'Rarity',
    'Condition',
    'Condition Label',
    'Quantity',
    'NM Market (USD)',
    'Est. Unit Value (USD)',
    'Est. Line Value (USD)',
    'Card ID',
  ]
  const rows = items.map((it) => {
    const nm = it.card.marketPrice
    const unit = nm == null ? '' : (nm * CONDITION_MULTIPLIERS[it.condition]).toFixed(2)
    const line = nm == null ? '' : itemValue(it).toFixed(2)
    return [
      it.card.name,
      it.card.setName,
      it.card.number,
      it.card.rarity ?? '',
      it.condition,
      CONDITION_LABELS[it.condition],
      it.quantity,
      nm == null ? '' : nm.toFixed(2),
      unit,
      line,
      it.card.id,
    ]
      .map(csvField)
      .join(',')
  })
  return [headers.map(csvField).join(','), ...rows].join('\r\n')
}

export function formatUsd(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}
