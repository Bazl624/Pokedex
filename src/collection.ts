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

/** Headers used by export and the downloadable import template. */
export const CSV_HEADERS = [
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
] as const

/** Example rows shown in the blank template (illustrative Card IDs). */
export function collectionTemplateCsv(): string {
  // Use well-known Base Set IDs that resolve reliably from the TCG API.
  const examples = [
    ['Charizard', 'Base', '4', 'Rare Holo', 'NM', 'Near Mint', '1', '', '', '', 'base1-4'],
    ['Pikachu', 'Base', '58', 'Common', 'LP', 'Lightly Played', '2', '', '', '', 'base1-58'],
  ]
  const lines = [
    CSV_HEADERS.map(csvField).join(','),
    ...examples.map((row) => row.map(csvField).join(',')),
  ]
  return lines.join('\r\n')
}

export interface CsvImportRow {
  cardId: string
  condition: Condition
  quantity: number
  /** Optional name from the CSV, used only for error messages. */
  name: string
  lineNumber: number
}

export interface CsvParseResult {
  rows: CsvImportRow[]
  errors: string[]
}

/** Minimal RFC-4180 CSV line splitter (handles quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function parseCondition(raw: string): Condition | null {
  const t = raw.trim().toUpperCase()
  if ((CONDITIONS as readonly string[]).includes(t)) return t as Condition
  // Accept full labels too ("Near Mint", "lightly played", …).
  const byLabel = (Object.entries(CONDITION_LABELS) as [Condition, string][]).find(
    ([, label]) => label.toLowerCase() === raw.trim().toLowerCase(),
  )
  return byLabel?.[0] ?? null
}

/**
 * Parse an inventory CSV (our export format or the downloadable template).
 * Requires a "Card ID" column and a Condition; Quantity defaults to 1.
 * Does not hit the network — callers resolve Card IDs via the TCG API.
 */
export function parseCollectionCsv(text: string): CsvParseResult {
  // Strip UTF-8 BOM if present.
  const cleaned = text.replace(/^\uFEFF/, '')
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { rows: [], errors: ['The file is empty.'] }
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => headers.indexOf(name.toLowerCase())
  const idCol = idx('card id')
  const condCol = idx('condition')
  const qtyCol = idx('quantity')
  const nameCol = idx('name')

  if (idCol < 0) {
    return {
      rows: [],
      errors: [
        'Missing required "Card ID" column. Download the CSV template for the expected format.',
      ],
    }
  }
  if (condCol < 0) {
    return {
      rows: [],
      errors: [
        'Missing required "Condition" column (NM, LP, MP, HP, or DMG). Download the CSV template for the expected format.',
      ],
    }
  }

  const rows: CsvImportRow[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const lineNumber = i + 1
    const cardId = (cols[idCol] ?? '').trim()
    const name = nameCol >= 0 ? (cols[nameCol] ?? '').trim() : ''
    const label = name || cardId || `row ${lineNumber}`

    if (!cardId) {
      errors.push(`Line ${lineNumber}: missing Card ID (${label}).`)
      continue
    }
    const condition = parseCondition(cols[condCol] ?? '')
    if (!condition) {
      errors.push(
        `Line ${lineNumber}: invalid Condition "${cols[condCol] ?? ''}" for ${label}. Use NM, LP, MP, HP, or DMG.`,
      )
      continue
    }
    const qtyRaw = qtyCol >= 0 ? (cols[qtyCol] ?? '1').trim() : '1'
    const quantity = Math.max(1, Math.floor(Number(qtyRaw) || 1))
    rows.push({ cardId, condition, quantity, name, lineNumber })
  }

  return { rows, errors }
}

/**
 * Merge imported lines into an existing collection. Same (cardId + condition)
 * lines add quantities together.
 */
export function mergeImportRows(
  items: CollectionItem[],
  imported: { card: Card; condition: Condition; quantity: number }[],
): CollectionItem[] {
  let next = items
  for (const row of imported) {
    const key = itemKey(row.card.id, row.condition)
    const existing = next.find((i) => i.key === key)
    if (existing) {
      next = next.map((i) =>
        i.key === key ? { ...i, quantity: i.quantity + row.quantity } : i,
      )
    } else {
      next = [
        ...next,
        { key, card: row.card, condition: row.condition, quantity: row.quantity },
      ]
    }
  }
  return next
}
