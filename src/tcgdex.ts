import type { Card, CardSet, CatalogLanguage, SearchOptions } from './tcgapi'

const DEX_BASE = 'https://api.tcgdex.net/v2'

/** Rough EUR→USD for Cardmarket figures from TCGdex (Asian catalog). */
const EUR_TO_USD = 1.08

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

interface DexBriefCard {
  id: string
  localId: string
  name: string
  image?: string
}

interface DexSetListItem {
  id: string
  name: string
  cardCount?: { total?: number; official?: number }
}

interface DexSetDetail extends DexSetListItem {
  cards?: DexBriefCard[]
  serie?: { id?: string; name?: string }
  releaseDate?: string
}

interface DexCardDetail extends DexBriefCard {
  rarity?: string
  set?: { id?: string; name?: string }
  pricing?: {
    cardmarket?: {
      unit?: string
      avg?: number | null
      trend?: number | null
      'avg-holo'?: number | null
      'trend-holo'?: number | null
    } | null
    tcgplayer?: {
      unit?: string
      marketPrice?: number | null
      midPrice?: number | null
    } | null
  } | null
}

export function makeDexCardId(lang: CatalogLanguage, dexId: string): string {
  return `tcgdex:${lang}:${dexId}`
}

export function parseDexCardId(
  id: string,
): { lang: Exclude<CatalogLanguage, 'en'>; dexId: string } | null {
  const m = /^tcgdex:(ja|zh-tw|zh-cn|ko):(.+)$/.exec(id.trim())
  if (!m) return null
  return { lang: m[1] as Exclude<CatalogLanguage, 'en'>, dexId: m[2] }
}

function imageUrls(image: string | undefined): {
  imageSmall: string | null
  imageLarge: string | null
} {
  if (!image) return { imageSmall: null, imageLarge: null }
  return {
    imageSmall: `${image}/low.webp`,
    imageLarge: `${image}/high.webp`,
  }
}

function extractDexPriceUsd(detail: DexCardDetail): number | null {
  const tp = detail.pricing?.tcgplayer
  if (tp) {
    if (typeof tp.marketPrice === 'number') {
      return tp.unit === 'EUR' ? tp.marketPrice * EUR_TO_USD : tp.marketPrice
    }
    if (typeof tp.midPrice === 'number') {
      return tp.unit === 'EUR' ? tp.midPrice * EUR_TO_USD : tp.midPrice
    }
  }
  const cm = detail.pricing?.cardmarket
  if (cm) {
    const eur =
      (typeof cm.trend === 'number' && cm.trend > 0 ? cm.trend : null) ??
      (typeof cm.avg === 'number' && cm.avg > 0 ? cm.avg : null) ??
      (typeof cm['trend-holo'] === 'number' && cm['trend-holo'] > 0
        ? cm['trend-holo']
        : null) ??
      (typeof cm['avg-holo'] === 'number' && cm['avg-holo'] > 0
        ? cm['avg-holo']
        : null)
    if (eur != null) return eur * EUR_TO_USD
  }
  return null
}

function briefToCard(
  lang: CatalogLanguage,
  brief: DexBriefCard,
  setName = 'Unknown set',
  detail?: DexCardDetail,
): Card {
  const imgs = imageUrls(detail?.image ?? brief.image)
  return {
    id: makeDexCardId(lang, brief.id),
    name: detail?.name ?? brief.name,
    setName: detail?.set?.name ?? setName,
    number: detail?.localId ?? brief.localId,
    rarity: detail?.rarity ?? null,
    imageSmall: imgs.imageSmall,
    imageLarge: imgs.imageLarge,
    marketPrice: detail ? extractDexPriceUsd(detail) : null,
    language: lang,
  }
}

function localIdMatches(localId: string, query: string): boolean {
  const a = localId.trim().toLowerCase()
  const b = query.trim().toLowerCase().replace(/^#/, '')
  if (!b) return false
  if (a === b) return true
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return String(Number(a)) === String(Number(b))
  }
  const strip = (s: string) => s.replace(/^0+/, '') || '0'
  return strip(a) === strip(b)
}

function numberEqCandidates(number: string): string[] {
  const n = number.trim().replace(/^#/, '')
  const out = new Set<string>([n])
  if (/^\d+$/.test(n)) {
    out.add(n.padStart(2, '0'))
    out.add(n.padStart(3, '0'))
  }
  return [...out]
}

async function fetchDexCardDetail(
  lang: CatalogLanguage,
  dexId: string,
  signal?: AbortSignal,
): Promise<DexCardDetail | null> {
  const url = `${DEX_BASE}/${lang}/cards/${encodeURIComponent(dexId)}`
  const res = await fetchWithRetry(url, 4, signal)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Lookup failed (HTTP ${res.status}). Please try again.`)
  }
  return (await res.json()) as DexCardDetail
}

/** Enrich brief list items with full details (prices) in small parallel batches. */
async function enrichBriefs(
  lang: CatalogLanguage,
  briefs: DexBriefCard[],
  setNameById: Map<string, string>,
  signal?: AbortSignal,
): Promise<Card[]> {
  const out: Card[] = []
  const batchSize = 6
  for (let i = 0; i < briefs.length; i += batchSize) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const batch = briefs.slice(i, i + batchSize)
    const settled = await Promise.all(
      batch.map(async (b) => {
        try {
          const detail = await fetchDexCardDetail(lang, b.id, signal)
          const setName =
            detail?.set?.name ??
            setNameById.get(b.id.split('-')[0] ?? '') ??
            'Unknown set'
          return briefToCard(lang, b, setName, detail ?? undefined)
        } catch {
          return briefToCard(lang, b, 'Unknown set')
        }
      }),
    )
    out.push(...settled)
  }
  return out
}

async function fetchDexSetDetail(
  lang: CatalogLanguage,
  setId: string,
  signal?: AbortSignal,
): Promise<DexSetDetail> {
  const url = `${DEX_BASE}/${lang}/sets/${encodeURIComponent(setId)}`
  const res = await fetchWithRetry(url, 4, signal)
  if (!res.ok) {
    throw new Error(`Could not load set (HTTP ${res.status}).`)
  }
  return (await res.json()) as DexSetDetail
}

/**
 * Search Asian (and other TCGdex) catalogs. Names should be in the selected
 * language (e.g. ピカチュウ for Japanese). Pair card # with a set when possible.
 */
export async function searchTcgdexCards(
  lang: Exclude<CatalogLanguage, 'en'>,
  opts: SearchOptions,
): Promise<Card[]> {
  const name = (opts.name ?? '').trim()
  const setId = (opts.setId ?? '').trim()
  const number = (opts.number ?? '').trim().replace(/^#/, '')
  if (!name && !setId && !number) {
    throw new Error('Enter a card name, number, and/or pick a set to search.')
  }

  const browsingSet = Boolean(setId && !name && !number)
  const pageSize = opts.pageSize ?? (browsingSet || number ? 48 : 24)
  const setNameById = new Map<string, string>()

  let briefs: DexBriefCard[] = []

  if (setId) {
    const set = await fetchDexSetDetail(lang, setId, opts.signal)
    setNameById.set(set.id, set.name)
    let cards = set.cards ?? []
    if (number) {
      cards = cards.filter((c) => localIdMatches(c.localId, number))
    }
    if (name) {
      const q = name.toLowerCase()
      cards = cards.filter((c) => c.name.toLowerCase().includes(q))
    }
    briefs = cards.slice(0, pageSize)
    if (briefs.length === 0 && (set.cards?.length ?? 0) === 0) {
      // Some locales list sets before card payloads are filled in.
      throw new Error(
        'That set has no card list in this language yet. Try another set, or search by name.',
      )
    }
  } else if (number && !name) {
    const candidates = numberEqCandidates(number)
    const url =
      `${DEX_BASE}/${lang}/cards?localId=eq:${encodeURIComponent(candidates.join('|'))}` +
      `&pagination:page=1&pagination:itemsPerPage=${pageSize}`
    const res = await fetchWithRetry(url, 4, opts.signal)
    if (!res.ok) {
      throw new Error(`Search failed (HTTP ${res.status}). Please try again.`)
    }
    briefs = ((await res.json()) as DexBriefCard[]).filter((c) =>
      localIdMatches(c.localId, number),
    )
  } else {
    const params = new URLSearchParams()
    if (name) params.set('name', name)
    if (number) {
      params.set('localId', `eq:${numberEqCandidates(number).join('|')}`)
    }
    params.set('pagination:page', '1')
    params.set('pagination:itemsPerPage', String(pageSize))
    const url = `${DEX_BASE}/${lang}/cards?${params.toString()}`
    const res = await fetchWithRetry(url, 4, opts.signal)
    if (!res.ok) {
      throw new Error(`Search failed (HTTP ${res.status}). Please try again.`)
    }
    briefs = (await res.json()) as DexBriefCard[]
    if (number) {
      briefs = briefs.filter((c) => localIdMatches(c.localId, number))
    }
  }

  const cards = await enrichBriefs(lang, briefs.slice(0, pageSize), setNameById, opts.signal)

  if (browsingSet || (number && !name)) return cards
  return cards.sort((a, b) => {
    const aHas = a.marketPrice != null ? 0 : 1
    const bHas = b.marketPrice != null ? 0 : 1
    return aHas - bHas
  })
}

export async function fetchTcgdexSets(
  lang: Exclude<CatalogLanguage, 'en'>,
  signal?: AbortSignal,
): Promise<CardSet[]> {
  const url = `${DEX_BASE}/${lang}/sets`
  const res = await fetchWithRetry(url, 4, signal)
  if (!res.ok) {
    throw new Error(`Could not load sets (HTTP ${res.status}).`)
  }
  const body = (await res.json()) as DexSetListItem[]
  // Newest-ish last in many locales — reverse so recent sets appear first.
  return [...body].reverse().map((s) => ({
    id: s.id,
    name: s.name,
    series: lang.toUpperCase(),
    releaseDate: '',
  }))
}

export async function fetchTcgdexCardById(
  lang: Exclude<CatalogLanguage, 'en'>,
  dexId: string,
  signal?: AbortSignal,
): Promise<Card | null> {
  const detail = await fetchDexCardDetail(lang, dexId, signal)
  if (!detail) return null
  return briefToCard(lang, detail, detail.set?.name ?? 'Unknown set', detail)
}
