import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const PC_ORIGIN = 'https://www.pricecharting.com'
const EBAY_LOOKBACK_DAYS = 30
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

interface EbayQuery {
  name: string
  setName: string
  number: string
  language?: string
  psaGrade?: number | null
}

interface EbaySoldSale {
  soldAt: string
  price: number
  title: string
  url: string | null
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function scoreProductUrl(url: string, q: EbayQuery): number {
  const path = url.toLowerCase()
  const nameSlug = slugify(q.name)
  const setSlug = slugify(q.setName)
  const num = q.number.trim().toLowerCase().replace(/^0+/, '')
  let score = 0
  if (nameSlug && path.includes(`/${nameSlug}`)) score += 6
  else if (nameSlug && path.includes(nameSlug)) score += 3
  if (num) {
    if (path.endsWith(`-${num}`) || path.endsWith(`/${nameSlug}-${num}`)) score += 5
    else if (path.includes(`-${num}`)) score += 2
  }
  if (setSlug) {
    const setToken = setSlug.replace(/^pokemon-/, '')
    if (path.includes(setSlug) || path.includes(setToken)) score += 3
    if (
      setToken === 'base' &&
      path.includes('pokemon-base-set') &&
      !path.includes('base-set-2')
    ) {
      score += 2
    }
  }
  if (!/1st|first\s*edition/i.test(q.name) && path.includes('1st-edition')) score -= 4
  if (!/shadowless/i.test(q.name) && path.includes('shadowless')) score -= 3
  const lang = q.language ?? 'en'
  if (lang === 'ja') {
    score += path.includes('japanese') ? 4 : path.includes('korean') || path.includes('chinese') ? -4 : 0
  } else if (lang === 'ko') {
    score += path.includes('korean') ? 4 : path.includes('japanese') || path.includes('chinese') ? -4 : 0
  } else if (lang === 'zh-cn' || lang === 'zh-tw') {
    score += path.includes('chinese') ? 4 : path.includes('japanese') || path.includes('korean') ? -4 : 0
  } else if (path.includes('japanese') || path.includes('korean') || path.includes('chinese')) {
    score -= 3
  } else {
    score += 1
  }
  return score
}

function parseEbaySalesFromHtml(html: string): EbaySoldSale[] {
  const sales: EbaySoldSale[] = []
  const rowRe =
    /<tr id="ebay-\d+">\s*<td class="date">(\d{4}-\d{2}-\d{2})<\/td>[\s\S]*?class="js-ebay-completed-sale"\s*href="([^"]+)"\s*>\s*([^<]+?)\s*<\/a>[\s\S]*?class="js-price"[^>]*>\s*\$([0-9,.]+)/g
  for (const m of html.matchAll(rowRe)) {
    const price = Number(m[4].replace(/,/g, ''))
    if (!Number.isFinite(price)) continue
    sales.push({
      soldAt: m[1],
      url: m[2].replace(/&amp;/g, '&'),
      title: m[3].trim(),
      price,
    })
  }
  return sales
}

function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return isoLocal(d)
}

function looksGraded(title: string): boolean {
  return /\b(PSA|BGS|CGC|SGC|TAG|ACE)\b/i.test(title)
}

function saleMatchesPsa(sale: EbaySoldSale, psa: number | null | undefined): boolean {
  if (psa == null) return !looksGraded(sale.title)
  return new RegExp(`\\bPSA\\s*${psa}\\b`, 'i').test(sale.title)
}

function pickHighestInWindow(
  sales: EbaySoldSale[],
  days: number,
  psaGrade?: number | null,
): { highest: EbaySoldSale; saleCount: number; gradeMatched: boolean } | null {
  const cutoff = isoDaysAgo(days)
  const today = isoLocal(new Date())
  const inWindow = sales.filter((s) => s.soldAt >= cutoff && s.soldAt <= today)
  if (inWindow.length === 0) return null
  const matched = inWindow.filter((s) => saleMatchesPsa(s, psaGrade))
  if (matched.length > 0) {
    return {
      highest: matched.reduce((a, b) => (b.price > a.price ? b : a)),
      saleCount: matched.length,
      gradeMatched: true,
    }
  }
  if (psaGrade != null) {
    const anySlab = inWindow.filter((s) => looksGraded(s.title))
    if (anySlab.length > 0) {
      return {
        highest: anySlab.reduce((a, b) => (b.price > a.price ? b : a)),
        saleCount: anySlab.length,
        gradeMatched: false,
      }
    }
  }
  return {
    highest: inWindow.reduce((a, b) => (b.price > a.price ? b : a)),
    saleCount: inWindow.length,
    gradeMatched: false,
  }
}

function readUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://localhost')
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  })
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`)
  return res.text()
}

function extractProductUrls(html: string): string[] {
  const found: string[] = []
  for (const m of html.matchAll(
    /https:\/\/www\.pricecharting\.com\/game\/[a-z0-9-]+\/[a-z0-9-]+/gi,
  )) {
    if (!found.includes(m[0])) found.push(m[0])
  }
  for (const m of html.matchAll(/href="(\/game\/[a-z0-9-]+\/[a-z0-9-]+)"/gi)) {
    const url = `${PC_ORIGIN}${m[1]}`
    if (!found.includes(url)) found.push(url)
  }
  return found
}

async function resolveProductUrl(q: EbayQuery): Promise<string> {
  const query = [q.name, q.setName, q.number].filter((p) => p.trim()).join(' ')
  const searchUrl = `${PC_ORIGIN}/search-products?q=${encodeURIComponent(query)}&type=prices`
  const html = await fetchText(searchUrl)
  const urls = extractProductUrls(html)
  if (urls.length === 0) throw new Error('No matching PriceCharting product found.')
  urls.sort((a, b) => scoreProductUrl(b, q) - scoreProductUrl(a, q))
  return urls[0]
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function handleEbayHigh(req: IncomingMessage, res: ServerResponse) {
  const url = readUrl(req)
  if (!url.pathname.includes('/api/ebay-high')) return false
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return true
  }

  const name = (url.searchParams.get('name') ?? '').trim()
  const setName = (url.searchParams.get('set') ?? '').trim()
  const number = (url.searchParams.get('number') ?? '').trim()
  const language = (url.searchParams.get('language') ?? 'en').trim()
  const psaRaw = url.searchParams.get('psa')
  const days = Math.max(
    1,
    Math.min(90, Number(url.searchParams.get('days') ?? EBAY_LOOKBACK_DAYS) || EBAY_LOOKBACK_DAYS),
  )
  const psaNum = psaRaw ? Number(psaRaw) : NaN
  const psaGrade = Number.isFinite(psaNum) ? psaNum : null

  if (!name) {
    sendJson(res, 400, { error: 'Missing name' })
    return true
  }

  const q: EbayQuery = { name, setName, number, language, psaGrade }

  try {
    const productUrl = await resolveProductUrl(q)
    const html = await fetchText(productUrl)
    const sales = parseEbaySalesFromHtml(html)
    const picked = pickHighestInWindow(sales, days, q.psaGrade)
    if (!picked) {
      sendJson(res, 404, {
        error: `No eBay sales found in the last ${days} days for this printing.`,
      })
      return true
    }
    sendJson(res, 200, {
      highest: picked.highest,
      saleCount: picked.saleCount,
      sourceUrl: productUrl,
      days,
      gradeMatched: picked.gradeMatched,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eBay lookup failed'
    sendJson(res, 502, { error: message })
  }
  return true
}

function attach(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((req, res, next) => {
    const path = req.url?.split('?')[0] ?? ''
    if (!path.includes('/api/ebay-high')) {
      next()
      return
    }
    void handleEbayHigh(req, res).then((handled) => {
      if (!handled) next()
    }).catch(next)
  })
}

/** Dev/preview middleware: GET /api/ebay-high → PriceCharting eBay sold comps. */
export function ebayProxyPlugin(): Plugin {
  return {
    name: 'ebay-proxy',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}
