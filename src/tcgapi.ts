const API_BASE = 'https://api.pokemontcg.io/v2'

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
  tcgplayer?: { prices?: Record<string, RawPriceBlock | null> }
  cardmarket?: { prices?: { averageSellPrice?: number | null; trendPrice?: number | null } }
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
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Fetch with retries. The public TCG API (behind Cloudflare) intermittently
 * returns transient HTTP 500s / dropped connections; retrying a couple of times
 * with a short backoff makes search reliable. Client errors (4xx other than
 * 429) are returned immediately so the caller can surface them.
 */
async function fetchWithRetry(url: string, attempts = 4): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err
    }
    if (attempt < attempts - 1) await sleep(400 * (attempt + 1))
  }
  void lastError
  throw new Error('Network error. Please try again.')
}

/**
 * Search the Pokémon TCG catalog by card name. Returns cards ordered by most
 * recent set first. Throws an Error with a friendly message on failure.
 */
export async function searchCards(query: string): Promise<Card[]> {
  const q = query.trim()
  if (!q) {
    throw new Error('Please enter a card name to search.')
  }

  // Quoted name query does token "contains" matching and safely handles spaces.
  const lucene = `name:"${q.replace(/"/g, '')}"`
  const url =
    `${API_BASE}/cards?q=${encodeURIComponent(lucene)}` +
    `&pageSize=24&orderBy=-set.releaseDate`

  const res = await fetchWithRetry(url)

  if (!res.ok) {
    throw new Error(`Search failed (HTTP ${res.status}). Please try again.`)
  }

  const body = (await res.json()) as { data?: RawCard[] }
  const cards = (body.data ?? []).map(toCard)

  // Surface cards that actually have a market price first — this app is about
  // values, so priced results are the most useful to the collector.
  return cards.sort((a, b) => {
    const aHas = a.marketPrice != null ? 0 : 1
    const bHas = b.marketPrice != null ? 0 : 1
    return aHas - bHas
  })
}
