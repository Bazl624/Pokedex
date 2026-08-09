import { isCatalogLanguage, type Card, type CatalogLanguage } from './tcgapi'

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

/** PSA grades 1–10. */
export const PSA_GRADES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const
export type PsaGrade = (typeof PSA_GRADES)[number]

/**
 * Rough multipliers vs raw Near Mint market for a PSA slab.
 * Real PSA prices vary wildly by card/era — these are ballpark estimates only.
 */
export const PSA_MULTIPLIERS: Record<PsaGrade, number> = {
  10: 4.0,
  9: 1.8,
  8: 1.2,
  7: 0.9,
  6: 0.7,
  5: 0.55,
  4: 0.45,
  3: 0.35,
  2: 0.25,
  1: 0.15,
}

/** Typical all-in cost to submit one card for PSA (economy tier + shipping/share). */
export const TYPICAL_GRADING_COST_USD = 40

export interface CollectionItem {
  /** Unique per (card + condition + PSA) so raw and slabs can coexist. */
  key: string
  card: Card
  condition: Condition
  quantity: number
  /** null = raw / ungraded; 1–10 = PSA grade. */
  psaGrade: PsaGrade | null
}

/** Primary inventory blob in localStorage. */
const STORAGE_KEY = 'pokedex.collection.v1'
/** Last-known-good non-empty inventory (never cleared when primary becomes empty). */
const BACKUP_KEY = 'pokedex.collection.backup.v1'
/** Raw bytes preserved if primary JSON fails to parse. */
const CORRUPT_KEY = 'pokedex.collection.corrupt.v1'

export function itemKey(
  cardId: string,
  condition: Condition,
  psaGrade: PsaGrade | null = null,
): string {
  return `${cardId}::${condition}::${psaGrade ?? 'raw'}`
}

function isPsaGrade(n: unknown): n is PsaGrade {
  return typeof n === 'number' && (PSA_GRADES as readonly number[]).includes(n)
}

function isCondition(c: unknown): c is Condition {
  return typeof c === 'string' && (CONDITIONS as readonly string[]).includes(c)
}

function isCardLike(c: unknown): c is Card {
  if (!c || typeof c !== 'object') return false
  const card = c as Partial<Card>
  return typeof card.id === 'string' && card.id.length > 0 && typeof card.name === 'string'
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Parse a stored JSON array into collection items.
 * Returns null when the payload is corrupt (not a valid array).
 * Returns [] when the array is valid but empty / has no usable rows.
 */
function parseStoredItems(raw: string): CollectionItem[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter(
        (i): i is Partial<CollectionItem> & { card: Card; condition: Condition } =>
          Boolean(i && typeof i === 'object' && isCardLike((i as CollectionItem).card) && isCondition((i as CollectionItem).condition)),
      )
      .map(normalizeItem)
  } catch {
    return null
  }
}

export type CollectionLoadSource =
  | 'primary'
  | 'backup'
  | 'empty'
  | 'corrupt-recovered'
  | 'corrupt-empty'

export interface CollectionLoadResult {
  items: CollectionItem[]
  source: CollectionLoadSource
  /** User-facing notice when we restored or failed to read data. */
  message: string | null
}

/**
 * Load inventory with automatic backup recovery.
 * Never throws; never deletes storage as a side effect of a failed parse
 * (corrupt primary is copied aside, then backup is tried).
 */
export function loadCollectionDetailed(): CollectionLoadResult {
  const primaryRaw = storageGet(STORAGE_KEY)
  const primaryItems = primaryRaw != null ? parseStoredItems(primaryRaw) : null

  if (primaryItems && primaryItems.length > 0) {
    return { items: primaryItems, source: 'primary', message: null }
  }

  const backupRaw = storageGet(BACKUP_KEY)
  const backupItems = backupRaw != null ? parseStoredItems(backupRaw) : null

  if (backupItems && backupItems.length > 0) {
    // Promote backup back to primary so the next launch is clean.
    const serialized = JSON.stringify(backupItems)
    storageSet(STORAGE_KEY, serialized)
    // Refresh backup to the normalized shape too.
    storageSet(BACKUP_KEY, serialized)

    const fromCorrupt = primaryRaw != null && primaryItems === null
    if (fromCorrupt) {
      storageSet(CORRUPT_KEY, primaryRaw)
    }

    const message = fromCorrupt
      ? 'Your collection file looked damaged, so we restored the automatic backup.'
      : 'Your collection was empty, so we restored the automatic backup.'
    // Survive React Strict Mode remounts (dev) and show once per restore.
    try {
      sessionStorage.setItem('pokedex.collection.restoreNotice', message)
    } catch {
      // ignore
    }

    return {
      items: backupItems,
      source: fromCorrupt ? 'corrupt-recovered' : 'backup',
      message,
    }
  }

  if (primaryRaw != null && primaryItems === null) {
    storageSet(CORRUPT_KEY, primaryRaw)
    return {
      items: [],
      source: 'corrupt-empty',
      message:
        'Could not read your saved collection and no backup was available. If you exported a CSV earlier, use Import CSV to restore it.',
    }
  }

  return { items: [], source: 'empty', message: null }
}

/** Convenience wrapper used by simple callers. */
export function loadCollection(): CollectionItem[] {
  return loadCollectionDetailed().items
}

export interface SaveCollectionResult {
  saved: boolean
  /** True when we refused to replace a non-empty primary with []. */
  refusedEmptyOverwrite: boolean
}

/**
 * Persist inventory. Keeps a last-known-good backup of any non-empty save.
 * Writing an empty list does not clear the backup (so you can recover).
 * Refuses to overwrite a non-empty primary with [] unless allowEmptyOverwrite.
 */
export function saveCollection(
  items: CollectionItem[],
  options: { allowEmptyOverwrite?: boolean } = {},
): SaveCollectionResult {
  const { allowEmptyOverwrite = true } = options
  const serialized = JSON.stringify(items)

  if (items.length === 0) {
    const primaryRaw = storageGet(STORAGE_KEY)
    const primaryItems = primaryRaw != null ? parseStoredItems(primaryRaw) : null

    // Preserve last good snapshot before clearing primary.
    if (primaryItems && primaryItems.length > 0) {
      storageSet(BACKUP_KEY, JSON.stringify(primaryItems))
    }

    if (
      !allowEmptyOverwrite &&
      primaryItems &&
      primaryItems.length > 0
    ) {
      return { saved: false, refusedEmptyOverwrite: true }
    }

    // If primary is corrupt, don't clobber it with [] — keep bytes under CORRUPT_KEY.
    if (primaryRaw != null && primaryItems === null) {
      storageSet(CORRUPT_KEY, primaryRaw)
      return { saved: false, refusedEmptyOverwrite: true }
    }

    const ok = storageSet(STORAGE_KEY, serialized)
    return { saved: ok, refusedEmptyOverwrite: false }
  }

  // Non-empty save: roll previous primary into backup, then write primary + backup.
  const previous = storageGet(STORAGE_KEY)
  if (previous) {
    const prevItems = parseStoredItems(previous)
    if (prevItems && prevItems.length > 0) {
      storageSet(BACKUP_KEY, previous)
    }
  }

  const okPrimary = storageSet(STORAGE_KEY, serialized)
  const okBackup = storageSet(BACKUP_KEY, serialized)
  return { saved: okPrimary && okBackup, refusedEmptyOverwrite: false }
}

/** True when a non-empty backup exists (for recovery UI). */
export function hasCollectionBackup(): boolean {
  const raw = storageGet(BACKUP_KEY)
  if (!raw) return false
  const items = parseStoredItems(raw)
  return Boolean(items && items.length > 0)
}

/** Card count stored in the backup, or 0. */
export function backupCardCount(): number {
  const raw = storageGet(BACKUP_KEY)
  if (!raw) return 0
  const items = parseStoredItems(raw)
  return items ? totalCards(items) : 0
}

/**
 * Force-restore inventory from the automatic backup into primary + React state.
 * Returns null if no usable backup exists.
 */
export function restoreCollectionBackup(): CollectionItem[] | null {
  const raw = storageGet(BACKUP_KEY)
  if (!raw) return null
  const items = parseStoredItems(raw)
  if (!items || items.length === 0) return null
  const serialized = JSON.stringify(items)
  storageSet(STORAGE_KEY, serialized)
  storageSet(BACKUP_KEY, serialized)
  return items
}

/** Unit estimated value (one copy) for a line item. */
export function unitValue(item: CollectionItem): number {
  if (item.card.marketPrice == null) return 0
  if (item.psaGrade != null) {
    return item.card.marketPrice * PSA_MULTIPLIERS[item.psaGrade]
  }
  return item.card.marketPrice * CONDITION_MULTIPLIERS[item.condition]
}

/** Estimated value of a single line item × quantity. */
export function itemValue(item: CollectionItem): number {
  return unitValue(item) * item.quantity
}

export function totalValue(items: CollectionItem[]): number {
  return items.reduce((sum, item) => sum + itemValue(item), 0)
}

export function totalCards(items: CollectionItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

/** Sort keys shared by search results and the collection list. */
export type SortKey = 'name' | 'value' | 'set'

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'value', label: 'Value' },
  { id: 'set', label: 'Set' },
]

/** Total quantity owned across all conditions/PSA lines for a card id. */
export function ownedQuantity(items: CollectionItem[], cardId: string): number {
  return items.reduce((n, i) => (i.card.id === cardId ? n + i.quantity : n), 0)
}

/** Precompute owned totals for search-result badges (O(n) once per render). */
export function ownedQuantityMap(items: CollectionItem[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const i of items) {
    map.set(i.card.id, (map.get(i.card.id) ?? 0) + i.quantity)
  }
  return map
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function compareCollectorNumber(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Sort search/catalog cards. Value sorts high→low; name/set are A→Z. */
export function sortCards(cards: Card[], key: SortKey): Card[] {
  const copy = [...cards]
  copy.sort((a, b) => {
    if (key === 'name') {
      return (
        compareText(a.name, b.name) ||
        compareText(a.setName, b.setName) ||
        compareCollectorNumber(a.number, b.number)
      )
    }
    if (key === 'set') {
      return (
        compareText(a.setName, b.setName) ||
        compareCollectorNumber(a.number, b.number) ||
        compareText(a.name, b.name)
      )
    }
    const ap = a.marketPrice
    const bp = b.marketPrice
    if (ap == null && bp == null) return compareText(a.name, b.name)
    if (ap == null) return 1
    if (bp == null) return -1
    return bp - ap || compareText(a.name, b.name)
  })
  return copy
}

/** Sort collection lines (view-only; does not rewrite storage order). */
export function sortCollectionItems(
  items: CollectionItem[],
  key: SortKey,
): CollectionItem[] {
  const copy = [...items]
  copy.sort((a, b) => {
    if (key === 'name') {
      return (
        compareText(a.card.name, b.card.name) ||
        compareText(a.card.setName, b.card.setName) ||
        compareCollectorNumber(a.card.number, b.card.number)
      )
    }
    if (key === 'set') {
      return (
        compareText(a.card.setName, b.card.setName) ||
        compareCollectorNumber(a.card.number, b.card.number) ||
        compareText(a.card.name, b.card.name)
      )
    }
    const av = itemValue(a)
    const bv = itemValue(b)
    const aPriced = a.card.marketPrice != null
    const bPriced = b.card.marketPrice != null
    if (!aPriced && !bPriced) return compareText(a.card.name, b.card.name)
    if (!aPriced) return 1
    if (!bPriced) return -1
    return bv - av || compareText(a.card.name, b.card.name)
  })
  return copy
}

/** Filter collection lines by name, set, number, or card id. */
export function filterCollectionItems(
  items: CollectionItem[],
  query: string,
): CollectionItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((i) => {
    const c = i.card
    return (
      c.name.toLowerCase().includes(q) ||
      c.setName.toLowerCase().includes(q) ||
      c.number.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    )
  })
}

export type GradingVerdict = 'yes' | 'maybe' | 'no' | 'unknown'

export interface GradingAdvice {
  verdict: GradingVerdict
  /** Short label for a badge, e.g. "Worth grading?". */
  label: string
  /** One-sentence explanation. */
  detail: string
  estimatedPsa10: number | null
  estimatedUpside: number | null
}

/**
 * Recommend whether a *raw* card is worth submitting for PSA grading.
 * Uses a PSA 10 estimate minus typical grading cost vs current raw value.
 * Only meaningful for stronger raw conditions (NM/LP).
 */
export function gradingAdvice(item: CollectionItem): GradingAdvice | null {
  // Already slabbed — no recommendation needed.
  if (item.psaGrade != null) return null

  const nm = item.card.marketPrice
  if (nm == null) {
    return {
      verdict: 'unknown',
      label: 'No price data',
      detail: 'Can’t estimate grading upside without a market price.',
      estimatedPsa10: null,
      estimatedUpside: null,
    }
  }

  if (item.condition === 'HP' || item.condition === 'DMG') {
    return {
      verdict: 'no',
      label: 'Not worth grading',
      detail: 'Heavy wear rarely grades high enough to beat the grading fee.',
      estimatedPsa10: nm * PSA_MULTIPLIERS[10],
      estimatedUpside: null,
    }
  }

  const raw = unitValue(item)
  const psa10 = nm * PSA_MULTIPLIERS[10]
  const upside = psa10 - TYPICAL_GRADING_COST_USD - raw

  if (nm < 25) {
    return {
      verdict: 'no',
      label: 'Not worth grading',
      detail: `Raw value is low (~${formatUsd(raw)}). Grading (~$${TYPICAL_GRADING_COST_USD}) usually costs more than you’d gain.`,
      estimatedPsa10: psa10,
      estimatedUpside: upside,
    }
  }

  if (upside >= TYPICAL_GRADING_COST_USD) {
    return {
      verdict: 'yes',
      label: 'Likely worth grading',
      detail: `If it could hit PSA 10 (~${formatUsd(psa10)}), estimated upside after ~$${TYPICAL_GRADING_COST_USD} fees is ~${formatUsd(upside)}.`,
      estimatedPsa10: psa10,
      estimatedUpside: upside,
    }
  }

  if (upside > 0) {
    return {
      verdict: 'maybe',
      label: 'Borderline',
      detail: `PSA 10 estimate ~${formatUsd(psa10)}. Thin upside (~${formatUsd(upside)}) after fees — only grade if it looks gem-mint.`,
      estimatedPsa10: psa10,
      estimatedUpside: upside,
    }
  }

  return {
    verdict: 'no',
    label: 'Not worth grading',
    detail: `PSA 10 estimate (~${formatUsd(psa10)}) doesn’t clearly beat raw value + ~$${TYPICAL_GRADING_COST_USD} fees.`,
    estimatedPsa10: psa10,
    estimatedUpside: upside,
  }
}

function normalizeItem(raw: Partial<CollectionItem> & { card: Card; condition: Condition }): CollectionItem {
  const psaGrade = isPsaGrade(raw.psaGrade) ? raw.psaGrade : null
  const condition = raw.condition
  const quantity = typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1
  // Fill any missing card fields so older localStorage blobs still render.
  const language: CatalogLanguage = isCatalogLanguage(raw.card.language)
    ? raw.card.language
    : raw.card.id.startsWith('tcgdex:')
      ? ((raw.card.id.split(':')[1] as CatalogLanguage) || 'en')
      : 'en'
  const card: Card = {
    id: raw.card.id,
    name: raw.card.name,
    setName: raw.card.setName ?? 'Unknown set',
    number: raw.card.number ?? '',
    rarity: raw.card.rarity ?? null,
    imageSmall: raw.card.imageSmall ?? null,
    imageLarge: raw.card.imageLarge ?? null,
    marketPrice:
      typeof raw.card.marketPrice === 'number' ? raw.card.marketPrice : null,
    language: isCatalogLanguage(language) ? language : 'en',
  }
  return {
    key: itemKey(card.id, condition, psaGrade),
    card,
    condition,
    quantity,
    psaGrade,
  }
}

/** Add one copy of a card in a given condition (raw), merging with any existing line. */
export function addToCollection(
  items: CollectionItem[],
  card: Card,
  condition: Condition,
  psaGrade: PsaGrade | null = null,
): CollectionItem[] {
  const key = itemKey(card.id, condition, psaGrade)
  const existing = items.find((i) => i.key === key)
  if (existing) {
    return items.map((i) =>
      i.key === key ? { ...i, quantity: i.quantity + 1 } : i,
    )
  }
  return [...items, { key, card, condition, quantity: 1, psaGrade }]
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

/**
 * Change condition on a line. Re-keys the item and merges into an existing
 * matching (card + condition + PSA) line when needed.
 */
export function setCondition(
  items: CollectionItem[],
  key: string,
  condition: Condition,
): CollectionItem[] {
  const current = items.find((i) => i.key === key)
  if (!current || current.condition === condition) return items

  const without = items.filter((i) => i.key !== key)
  const newKey = itemKey(current.card.id, condition, current.psaGrade)
  const existing = without.find((i) => i.key === newKey)
  if (existing) {
    return without.map((i) =>
      i.key === newKey
        ? { ...i, quantity: i.quantity + current.quantity }
        : i,
    )
  }
  return [
    ...without,
    { ...current, key: newKey, condition },
  ]
}

/**
 * Set or clear the PSA grade on a line. Re-keys the item and merges into an
 * existing matching slab/raw line when needed.
 */
export function setPsaGrade(
  items: CollectionItem[],
  key: string,
  psaGrade: PsaGrade | null,
): CollectionItem[] {
  const current = items.find((i) => i.key === key)
  if (!current || current.psaGrade === psaGrade) return items

  const without = items.filter((i) => i.key !== key)
  const newKey = itemKey(current.card.id, current.condition, psaGrade)
  const existing = without.find((i) => i.key === newKey)
  if (existing) {
    return without.map((i) =>
      i.key === newKey
        ? { ...i, quantity: i.quantity + current.quantity }
        : i,
    )
  }
  return [
    ...without,
    { ...current, key: newKey, psaGrade },
  ]
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
  const rows = items.map((it) => {
    const nm = it.card.marketPrice
    const unit = nm == null ? '' : unitValue(it).toFixed(2)
    const line = nm == null ? '' : itemValue(it).toFixed(2)
    return [
      it.card.name,
      it.card.setName,
      it.card.number,
      it.card.rarity ?? '',
      it.condition,
      CONDITION_LABELS[it.condition],
      it.psaGrade == null ? '' : String(it.psaGrade),
      it.quantity,
      nm == null ? '' : nm.toFixed(2),
      unit,
      line,
      it.card.id,
    ]
      .map(csvField)
      .join(',')
  })
  return [CSV_HEADERS.map(csvField).join(','), ...rows].join('\r\n')
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
  'PSA Grade',
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
    ['Charizard', 'Base', '4', 'Rare Holo', 'NM', 'Near Mint', '10', '1', '', '', '', 'base1-4'],
    ['Pikachu', 'Base', '58', 'Common', 'LP', 'Lightly Played', '', '2', '', '', '', 'base1-58'],
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
  psaGrade: PsaGrade | null
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

/** Empty / "raw" / "ungraded" → null; otherwise PSA 1–10. */
function parsePsaGrade(raw: string): PsaGrade | null | undefined {
  const t = raw.trim().toLowerCase()
  if (!t || t === 'raw' || t === 'ungraded' || t === 'none' || t === '-') return null
  const n = Number(t.replace(/^psa\s*/i, ''))
  if (isPsaGrade(n)) return n
  return undefined
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
  const psaCol = idx('psa grade')
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
    let psaGrade: PsaGrade | null = null
    if (psaCol >= 0) {
      const parsedPsa = parsePsaGrade(cols[psaCol] ?? '')
      if (parsedPsa === undefined) {
        errors.push(
          `Line ${lineNumber}: invalid PSA Grade "${cols[psaCol] ?? ''}" for ${label}. Use 1–10, or leave blank for raw.`,
        )
        continue
      }
      psaGrade = parsedPsa
    }
    const qtyRaw = qtyCol >= 0 ? (cols[qtyCol] ?? '1').trim() : '1'
    const quantity = Math.max(1, Math.floor(Number(qtyRaw) || 1))
    rows.push({ cardId, condition, psaGrade, quantity, name, lineNumber })
  }

  return { rows, errors }
}

/**
 * Merge imported lines into an existing collection. Same
 * (cardId + condition + PSA) lines add quantities together.
 */
export function mergeImportRows(
  items: CollectionItem[],
  imported: { card: Card; condition: Condition; psaGrade: PsaGrade | null; quantity: number }[],
): CollectionItem[] {
  let next = items
  for (const row of imported) {
    const psaGrade = row.psaGrade ?? null
    const key = itemKey(row.card.id, row.condition, psaGrade)
    const existing = next.find((i) => i.key === key)
    if (existing) {
      next = next.map((i) =>
        i.key === key ? { ...i, quantity: i.quantity + row.quantity } : i,
      )
    } else {
      next = [
        ...next,
        {
          key,
          card: row.card,
          condition: row.condition,
          quantity: row.quantity,
          psaGrade,
        },
      ]
    }
  }
  return next
}
