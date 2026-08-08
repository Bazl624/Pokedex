import type { Card } from './tcgapi'
import type { PsaGrade } from './collection'
import {
  EBAY_LOOKBACK_DAYS,
  parseEbaySalesFromMarkdown,
  pickHighestInWindow,
  scoreProductUrl,
  type EbayCardQuery,
  type EbayHighResult,
} from './ebayShared'

export {
  EBAY_LOOKBACK_DAYS,
  ebaySoldSearchUrl,
  parseEbaySalesFromHtml,
  parseEbaySalesFromMarkdown,
  pickHighestInWindow,
  scoreProductUrl,
  type EbayCardQuery,
  type EbayHighResult,
  type EbaySoldSale,
} from './ebayShared'

const JINA = 'https://r.jina.ai/'
const PC_ORIGIN = 'https://www.pricecharting.com'

const memoryCache = new Map<string, EbayHighResult>()

function cacheKey(q: EbayCardQuery): string {
  return [
    q.name.trim().toLowerCase(),
    q.setName.trim().toLowerCase(),
    q.number.trim().toLowerCase(),
    q.language ?? 'en',
    q.psaGrade ?? 'raw',
  ].join('|')
}

async function readViaJina(targetUrl: string, signal?: AbortSignal): Promise<string> {
  const url = `${JINA}${targetUrl}`
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'text/plain' },
  })
  if (!res.ok) {
    throw new Error(`Could not load price comps (HTTP ${res.status}).`)
  }
  return res.text()
}

function extractProductUrls(markdown: string): string[] {
  const found: string[] = []
  const re = /https:\/\/www\.pricecharting\.com\/game\/[a-z0-9-]+\/[a-z0-9-]+/gi
  for (const m of markdown.matchAll(re)) {
    const url = m[0].replace(/[.,;)]+$/, '')
    if (!found.includes(url)) found.push(url)
  }
  return found
}

async function resolveProductUrl(q: EbayCardQuery, signal?: AbortSignal): Promise<string> {
  const query = [q.name, q.setName, q.number].filter((p) => p.trim()).join(' ')
  const searchUrl = `${PC_ORIGIN}/search-products?q=${encodeURIComponent(query)}&type=prices`
  const markdown = await readViaJina(searchUrl, signal)
  const urls = extractProductUrls(markdown)
  if (urls.length === 0) {
    throw new Error('No matching PriceCharting product found.')
  }
  urls.sort((a, b) => scoreProductUrl(b, q) - scoreProductUrl(a, q))
  return urls[0]
}

function localEbayApiUrl(q: EbayCardQuery): string {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams({
    name: q.name,
    set: q.setName,
    number: q.number,
    days: String(EBAY_LOOKBACK_DAYS),
  })
  if (q.language) params.set('language', q.language)
  if (q.psaGrade != null) params.set('psa', String(q.psaGrade))
  return `${prefix}api/ebay-high?${params.toString()}`
}

async function fetchViaLocalProxy(
  q: EbayCardQuery,
  signal?: AbortSignal,
): Promise<EbayHighResult | null> {
  try {
    const res = await fetch(localEbayApiUrl(q), { signal })
    if (!res.ok) return null
    const body = (await res.json()) as EbayHighResult | { error?: string }
    if ('highest' in body && body.highest) return body as EbayHighResult
    return null
  } catch {
    return null
  }
}

async function fetchViaJinaComps(
  q: EbayCardQuery,
  signal?: AbortSignal,
): Promise<EbayHighResult> {
  const productUrl = await resolveProductUrl(q, signal)
  const markdown = await readViaJina(productUrl, signal)
  const sales = parseEbaySalesFromMarkdown(markdown)
  const picked = pickHighestInWindow(sales, EBAY_LOOKBACK_DAYS, q.psaGrade)
  if (!picked) {
    throw new Error(
      `No eBay sales found in the last ${EBAY_LOOKBACK_DAYS} days for this printing.`,
    )
  }
  return {
    highest: picked.highest,
    saleCount: picked.saleCount,
    sourceUrl: productUrl,
    days: EBAY_LOOKBACK_DAYS,
    gradeMatched: picked.gradeMatched,
  }
}

/**
 * Highest completed eBay sale for a card printing in the last 3 days.
 * Uses the local Vite `/api/ebay-high` proxy when available; otherwise reads
 * PriceCharting sold comps via a CORS-friendly page mirror (no API key).
 */
export async function fetchHighestEbaySold(
  q: EbayCardQuery,
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<EbayHighResult> {
  const key = cacheKey(q)
  if (!options.force) {
    const cached = memoryCache.get(key)
    if (cached) return cached
  }

  const fromProxy = await fetchViaLocalProxy(q, options.signal)
  if (fromProxy) {
    memoryCache.set(key, fromProxy)
    return fromProxy
  }

  const result = await fetchViaJinaComps(q, options.signal)
  memoryCache.set(key, result)
  return result
}

export function cardToEbayQuery(
  card: Card,
  psaGrade: PsaGrade | null = null,
): EbayCardQuery {
  return {
    name: card.name,
    setName: card.setName,
    number: card.number,
    language: card.language,
    psaGrade,
  }
}
