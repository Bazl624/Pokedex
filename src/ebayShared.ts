/** Look back this many calendar days for completed eBay sales. */
export const EBAY_LOOKBACK_DAYS = 3

export interface EbaySoldSale {
  soldAt: string // YYYY-MM-DD
  price: number
  title: string
  url: string | null
}

export interface EbayHighResult {
  highest: EbaySoldSale
  /** Number of completed sales used for the high (after grade filter). */
  saleCount: number
  /** PriceCharting product page used as the comps source. */
  sourceUrl: string
  /** Lookback window in days. */
  days: number
  /**
   * True when the returned sale matched the requested PSA filter (or raw
   * filter). False when we fell back to a broader in-window pool.
   */
  gradeMatched: boolean
}

export interface EbayCardQuery {
  name: string
  setName: string
  number: string
  language?: string
  psaGrade?: number | null
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function languageConsoleBoost(url: string, language: string | undefined): number {
  const u = url.toLowerCase()
  switch (language) {
    case 'ja':
      return u.includes('japanese') || u.includes('-jp-')
        ? 4
        : u.includes('korean') || u.includes('chinese')
          ? -4
          : 0
    case 'ko':
      return u.includes('korean')
        ? 4
        : u.includes('japanese') || u.includes('chinese')
          ? -4
          : 0
    case 'zh-cn':
    case 'zh-tw':
      return u.includes('chinese')
        ? 4
        : u.includes('japanese') || u.includes('korean')
          ? -4
          : 0
    default:
      if (u.includes('japanese') || u.includes('korean') || u.includes('chinese')) {
        return -3
      }
      return 1
  }
}

/** Score a PriceCharting /game/… URL for how well it matches the card. */
export function scoreProductUrl(url: string, q: EbayCardQuery): number {
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

  const wantsFirst = /1st|first\s*edition/i.test(q.name)
  const wantsShadowless = /shadowless/i.test(q.name)
  if (!wantsFirst && path.includes('1st-edition')) score -= 4
  if (!wantsShadowless && path.includes('shadowless')) score -= 3
  if (path.includes('error') || path.includes('misprint')) score -= 2

  score += languageConsoleBoost(path, q.language)
  return score
}

/** Parse completed-sale rows from Jina's PriceCharting markdown. */
export function parseEbaySalesFromMarkdown(markdown: string): EbaySoldSale[] {
  const sales: EbaySoldSale[] = []
  const rowRe =
    /\|\s*(\d{4}-\d{2}-\d{2})\s*\|[^|\n]*\|\s*\[([^\]]+)\]\((https:\/\/www\.ebay\.com\/itm\/[^)]+)\)[^|\n]*\|\s*\$([0-9,.]+)\s*\|/g
  for (const m of markdown.matchAll(rowRe)) {
    const price = Number(m[4].replace(/,/g, ''))
    if (!Number.isFinite(price)) continue
    sales.push({
      soldAt: m[1],
      title: m[2].trim(),
      url: m[3],
      price,
    })
  }
  return sales
}

/** Parse completed-sale rows from a raw PriceCharting HTML product page. */
export function parseEbaySalesFromHtml(html: string): EbaySoldSale[] {
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

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoTodayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function saleMatchesPsa(sale: EbaySoldSale, psa: number | null | undefined): boolean {
  if (psa == null) {
    return !/\b(PSA|BGS|CGC|SGC)\s*\d/i.test(sale.title)
  }
  const re = new RegExp(`\\bPSA\\s*${psa}\\b`, 'i')
  return re.test(sale.title)
}

export function pickHighestInWindow(
  sales: EbaySoldSale[],
  days: number,
  psaGrade?: number | null,
): { highest: EbaySoldSale; saleCount: number; gradeMatched: boolean } | null {
  const cutoff = isoDaysAgo(days)
  const today = isoTodayLocal()
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

  // Requested a PSA grade but none matched — prefer any PSA slab over raw.
  if (psaGrade != null) {
    const anyPsa = inWindow.filter((s) => /\bPSA\s*\d/i.test(s.title))
    if (anyPsa.length > 0) {
      return {
        highest: anyPsa.reduce((a, b) => (b.price > a.price ? b : a)),
        saleCount: anyPsa.length,
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

/** Public eBay sold search (highest price first). */
export function ebaySoldSearchUrl(q: EbayCardQuery): string {
  const parts = [q.name, q.setName, q.number].map((p) => p.trim()).filter(Boolean)
  if (q.psaGrade != null) parts.push(`PSA ${q.psaGrade}`)
  const params = new URLSearchParams({
    _nkw: parts.join(' '),
    _sacat: '0',
    LH_Sold: '1',
    LH_Complete: '1',
    _sop: '16',
    rt: 'nc',
    _from: 'R40',
  })
  return `https://www.ebay.com/sch/i.html?${params.toString()}`
}
