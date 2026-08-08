import { createWorker, type Worker } from 'tesseract.js'

export interface ScanResult {
  /** Best-guess card name to search for (may be empty if nothing readable). */
  name: string
  /** Full raw OCR text, useful for debugging or manual correction. */
  rawText: string
}

// Structural words printed on cards that are never part of the card name.
const STOP_WORDS = new Set([
  'basic',
  'stage',
  'evolves',
  'from',
  'pokemon',
  'pokémon',
  'trainer',
  'energy',
  'item',
  'supporter',
  'stadium',
  'ability',
  'weakness',
  'resistance',
  'retreat',
  'hp',
])

/**
 * Reduce a raw OCR line to a plausible Pokémon card name: keep letters (plus a
 * few name characters like apostrophes/hyphens), drop HP values, numbers, and
 * structural keywords. Returns '' when nothing name-like remains.
 */
function cleanName(line: string): string {
  const tokens = line
    .replace(/[’‘]/g, "'") // normalize curly apostrophes
    // Collapse "Pokémon" (and OCR variants like "Pok mon"/"Pok3mon") to one
    // token so it gets dropped as a stop word instead of leaving stray parts.
    .replace(/pok[\s.'-]*[eé3]?mon/gi, 'pokemon')
    .replace(/[^A-Za-z'.\- ]+/g, ' ') // drop digits/symbols (e.g. "HP 120")
    .split(/\s+/)
    .map((t) => t.replace(/^['.-]+|['.-]+$/g, '').trim()) // trim stray punctuation
    .filter((t) => t.length >= 2) // drop OCR-noise single letters
    .filter((t) => !STOP_WORDS.has(t.toLowerCase()))

  return tokens.join(' ').trim()
}

/** Count of alphabetic characters. */
function alphaScore(s: string): number {
  return (s.match(/[A-Za-z]/g) ?? []).length
}

function wordCount(s: string): number {
  return s.split(' ').filter(Boolean).length
}

/**
 * Absolute base for self-hosted OCR assets under public/tesseract/.
 * Using same-origin paths (not the jsDelivr CDN) so scanning works reliably
 * on phones / installed PWAs even when the service worker is active.
 */
function tesseractBase(): string {
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') ? base : `${base}/`
  // Absolute URL is required so the Worker blob can importScripts correctly.
  return new URL(`${root}tesseract/`, window.location.origin).href
}

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const base = tesseractBase()
      const worker = await createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        // Workers spawned via blob + importScripts need this on some iOS versions.
        workerBlobURL: true,
      })
      return worker
    })().catch((err) => {
      // Allow a retry on the next scan if the first setup fails.
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

/**
 * Run OCR on a captured card image and heuristically extract the card name.
 * Card names sit near the top of the card, so we inspect the first several
 * OCR lines and pick the topmost that looks like a name. OCR on phone photos
 * is imperfect, so the UI treats this as a starting search term the user can
 * confirm or edit.
 */
export async function scanCardName(
  image: string | HTMLCanvasElement,
): Promise<ScanResult> {
  const worker = await getWorker()
  const { data } = await worker.recognize(image)
  const rawText = data.text ?? ''

  const cleaned = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map(cleanName)

  const nameLike = cleaned.filter(
    (c) => alphaScore(c) >= 3 && wordCount(c) >= 1 && wordCount(c) <= 4,
  )

  const name = nameLike[0] ?? ''
  return { name, rawText }
}
