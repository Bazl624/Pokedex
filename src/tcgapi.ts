import {
  fetchTcgdexCardById,
  fetchTcgdexSets,
  parseDexCardId,
  searchTcgdexCards,
} from './tcgdex'

const API_BASE = 'https://api.pokemontcg.io/v2'

/** Catalog language. English uses pokemontcg.io; Asian langs use TCGdex. */
export type CatalogLanguage = 'en' | 'ja' | 'zh-tw' | 'zh-cn' | 'ko'

export const CATALOG_LANGUAGES: {
  id: CatalogLanguage
  label: string
  short: string
}[] = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'ja', label: '日本語 (Japanese)', short: 'JP' },
  { id: 'zh-tw', label: '繁體中文 (Traditional)', short: 'ZH-TW' },
  { id: 'zh-cn', label: '简体中文 (Simplified)', short: 'ZH-CN' },
  { id: 'ko', label: '한국어 (Korean)', short: 'KO' },
]

export function isCatalogLanguage(v: unknown): v is CatalogLanguage {
  return (
    v === 'en' || v === 'ja' || v === 'zh-tw' || v === 'zh-cn' || v === 'ko'
  )
}

export interface Card {
  id: string
  name: string
  setName: string
  number: string
  rarity: string | null
  imageSmall: string | null
  imageLarge: string | null
  /** Representative market price in USD, or null when unknown. */
  marketPrice: number | null
  /** Catalog language this card was loaded from. Defaults to English. */
  language: CatalogLanguage
  /**
   * National Pokédex number when the card is a Pokémon (first listed if multiple).
   * Null for trainers/energy or when the API omits it.
   */
  pokedexNumber: number | null
}

export interface CardSet {
  id: string
  name: string
  series: string
  releaseDate: string
}

interface RawPriceBlock {
  market?: number | null
  mid?: number | null
}

interface RawCard {
  id: string
  name: string
  number: string
  rarity?: string
  images?: { small?: string; large?: string }
  set?: { name?: string }
  nationalPokedexNumbers?: number[]
  tcgplayer?: { prices?: Record<string, RawPriceBlock | null> }
  cardmarket?: { prices?: { averageSellPrice?: number | null; trendPrice?: number | null } }
}

function extractPokedexNumber(raw: RawCard): number | null {
  const nums = raw.nationalPokedexNumbers
  if (!Array.isArray(nums) || nums.length === 0) return null
  const n = nums.find((x) => typeof x === 'number' && Number.isFinite(x))
  return n ?? null
}

/**
 * Pick a single representative USD market price from the various price blocks
 * a card can carry (TCGplayer variants first, then Cardmarket as a fallback).
 */
function extractMarketPrice(raw: RawCard): number | null {
  const tp = raw.tcgplayer?.prices
  if (tp) {
    for (const block of Object.values(tp)) {
      if (block && typeof block.market === 'number') return block.market
    }
    for (const block of Object.values(tp)) {
      if (block && typeof block.mid === 'number') return block.mid
    }
  }
  const cm = raw.cardmarket?.prices
  if (cm && typeof cm.averageSellPrice === 'number') return cm.averageSellPrice
  if (cm && typeof cm.trendPrice === 'number') return cm.trendPrice
  return null
}

function toCard(raw: RawCard): Card {
  return {
    id: raw.id,
    name: raw.name,
    setName: raw.set?.name ?? 'Unknown set',
    number: raw.number,
    rarity: raw.rarity ?? null,
    imageSmall: raw.images?.small ?? null,
    imageLarge: raw.images?.large ?? null,
    marketPrice: extractMarketPrice(raw),
    language: 'en',
    pokedexNumber: extractPokedexNumber(raw),
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Fetch with retries. The public TCG API (behind Cloudflare) intermittently
 * returns transient HTTP 500s / dropped connections; retrying a couple of times
 * with a short backoff makes search reliable. Client errors (4xx other than
 * 429) are returned immediately so the caller can surface them.
 */
async function fetchWithRetry(
  url: string,
  attempts = 4,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch(url, { signal })
      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastError = err
    }
    if (attempt < attempts - 1) await sleep(400 * (attempt + 1))
  }
  void lastError
  throw new Error('Network error. Please try again.')
}

export interface SearchOptions {
  /** Card name (optional if setId or number is provided). */
  name?: string
  /** Set id filter, e.g. "base1" (optional if name or number is provided). */
  setId?: string
  /**
   * Collector number within a set, e.g. "4", "25", "TG01".
   * Pair with setId when possible — the same number exists in many sets.
   */
  number?: string
  /** Catalog language (default English / pokemontcg.io). */
  language?: CatalogLanguage
  signal?: AbortSignal
  /** Max results (default 48 when filtering by set, else 24). */
  pageSize?: number
}

async function searchEnglishCards(opts: SearchOptions): Promise<Card[]> {
  const name = (opts.name ?? '').trim()
  const setId = (opts.setId ?? '').trim()
  const number = (opts.number ?? '').trim().replace(/^#/, '').replace(/"/g, '')
  if (!name && !setId && !number) {
    throw new Error('Enter a card name, number, and/or pick a set to search.')
  }

  const parts: string[] = []
  if (name) {
    parts.push(`name:"${name.replace(/"/g, '')}"`)
  }
  if (setId) {
    parts.push(`set.id:${setId.replace(/[^\w.-]/g, '')}`)
  }
  if (number) {
    parts.push(`number:"${number}"`)
  }
  const browsingSet = Boolean(setId && !name && !number)
  // Larger pages when browsing a set — collectors often add many from one set.
  const pageSize = opts.pageSize ?? (browsingSet || number ? 100 : 36)
  const url =
    `${API_BASE}/cards?q=${encodeURIComponent(parts.join(' '))}` +
    `&pageSize=${pageSize}&orderBy=number`

  try {
    const res = await fetchWithRetry(url, 4, opts.signal)
    if (res.ok) {
      const body = (await res.json()) as { data?: RawCard[] }
      const cards = (body.data ?? []).map(toCard)
      // Set list may have come from TCGdex fallback with ids pokemontcg.io
      // doesn't know — fall through to TCGdex when the set browse is empty.
      if (cards.length > 0 || !setId) {
        if (browsingSet || (number && !name)) return cards
        return cards.sort((a, b) => {
          const aHas = a.marketPrice != null ? 0 : 1
          const bHas = b.marketPrice != null ? 0 : 1
          return aHas - bHas
        })
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    // Fall through to TCGdex when pokemontcg.io is down.
    if (!setId && !name && !number) throw err
  }

  // Reliable fallback (also covers TCGdex-only set ids after a sets fallback).
  return searchTcgdexCards('en', { ...opts, language: 'en', pageSize })
}

/**
 * Search the Pokémon TCG catalog by card name, set, and/or collector number.
 * English → pokemontcg.io; Japanese / Chinese / Korean → TCGdex.
 */
export async function searchCards(options: SearchOptions | string): Promise<Card[]> {
  const opts: SearchOptions =
    typeof options === 'string' ? { name: options } : options
  const language = opts.language ?? 'en'
  if (language === 'en') return searchEnglishCards(opts)
  return searchTcgdexCards(language, opts)
}

/**
 * Load English sets from pokemontcg.io in smaller pages — large pageSize=250
 * requests frequently 500/502 from Cloudflare.
 */
async function fetchPokemonTcgSets(signal?: AbortSignal): Promise<CardSet[]> {
  const pageSize = 100
  const sets: CardSet[] = []
  for (let page = 1; page <= 5; page++) {
    const url =
      `${API_BASE}/sets?page=${page}&pageSize=${pageSize}&orderBy=-releaseDate`
    const res = await fetchWithRetry(url, 5, signal)
    if (!res.ok) {
      throw new Error(`Could not load sets (HTTP ${res.status}).`)
    }
    const body = (await res.json()) as {
      data?: { id: string; name: string; series?: string; releaseDate?: string }[]
      totalCount?: number
    }
    const batch = body.data ?? []
    for (const s of batch) {
      sets.push({
        id: s.id,
        name: s.name,
        series: s.series ?? '',
        releaseDate: s.releaseDate ?? '',
      })
    }
    if (batch.length < pageSize) break
    if (typeof body.totalCount === 'number' && sets.length >= body.totalCount) break
  }
  if (sets.length === 0) {
    throw new Error('Could not load sets (empty response).')
  }
  return sets
}

/** Load published sets for a catalog language, newest first when possible. */
export async function fetchSets(
  language: CatalogLanguage = 'en',
  signal?: AbortSignal,
): Promise<CardSet[]> {
  if (language !== 'en') {
    return fetchTcgdexSets(language, signal)
  }

  // pokemontcg.io is flaky — try it first (ids match English card search),
  // then fall back to TCGdex so the Set dropdown is never empty.
  try {
    return await fetchPokemonTcgSets(signal)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    try {
      return await fetchTcgdexSets('en', signal)
    } catch (fallbackErr) {
      if (fallbackErr instanceof DOMException && fallbackErr.name === 'AbortError') {
        throw fallbackErr
      }
      throw err instanceof Error ? err : new Error('Could not load sets.')
    }
  }
}

/**
 * Fetch a single card by id. English ids are pokemontcg.io ids (e.g. "base1-4").
 * Asian cards use `tcgdex:<lang>:<id>` (e.g. "tcgdex:ja:SV2a-025").
 */
export async function fetchCardById(
  id: string,
  signal?: AbortSignal,
): Promise<Card | null> {
  const slug = id.trim()
  if (!slug) return null

  const dex = parseDexCardId(slug)
  if (dex) {
    return fetchTcgdexCardById(dex.lang, dex.dexId, signal)
  }

  const url = `${API_BASE}/cards/${encodeURIComponent(slug)}`
  const res = await fetchWithRetry(url, 5, signal)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Lookup failed (HTTP ${res.status}). Please try again.`)
  }
  const body = (await res.json()) as { data?: RawCard }
  return body.data ? toCard(body.data) : null
}
