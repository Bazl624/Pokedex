import { useEffect, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { searchCards, type Card } from './tcgapi'
import { scanCardName } from './scan'
import { GRADE_GUIDE } from './grading'
import {
  CONDITIONS,
  CONDITION_LABELS,
  CONDITION_MULTIPLIERS,
  type Condition,
  type CollectionItem,
  addToCollection,
  collectionToCsv,
  formatUsd,
  itemValue,
  loadCollection,
  removeItem,
  saveCollection,
  setQuantity,
  totalCards,
  totalValue,
} from './collection'

type Tab = 'search' | 'collection' | 'guide'

function ConditionSelect({
  value,
  onChange,
  id,
}: {
  value: Condition
  onChange: (c: Condition) => void
  id?: string
}) {
  return (
    <select
      id={id}
      className="condition-select"
      value={value}
      onChange={(e) => onChange(e.target.value as Condition)}
    >
      {CONDITIONS.map((c) => (
        <option key={c} value={c}>
          {c} — {CONDITION_LABELS[c]}
        </option>
      ))}
    </select>
  )
}

function SearchResult({
  card,
  onAdd,
}: {
  card: Card
  onAdd: (card: Card, condition: Condition) => void
}) {
  const [condition, setCondition] = useState<Condition>('NM')
  const estimated =
    card.marketPrice == null
      ? null
      : card.marketPrice * CONDITION_MULTIPLIERS[condition]

  return (
    <li className="result">
      {card.imageSmall ? (
        <img className="result__img" src={card.imageSmall} alt={card.name} loading="lazy" />
      ) : (
        <div className="result__img result__img--empty">No image</div>
      )}
      <div className="result__body">
        <h3 className="result__name">{card.name}</h3>
        <p className="result__meta">
          {card.setName} · #{card.number}
          {card.rarity ? ` · ${card.rarity}` : ''}
        </p>
        <p className="result__price">
          <span>NM market: {formatUsd(card.marketPrice)}</span>
          {estimated != null && condition !== 'NM' && (
            <span className="result__price-est"> · {condition}: {formatUsd(estimated)}</span>
          )}
        </p>
        <div className="result__actions">
          <ConditionSelect value={condition} onChange={setCondition} />
          <button className="btn btn--add" onClick={() => onAdd(card, condition)}>
            + Add
          </button>
        </div>
      </div>
    </li>
  )
}

function CollectionRow({
  item,
  onQty,
  onRemove,
}: {
  item: CollectionItem
  onQty: (key: string, qty: number) => void
  onRemove: (key: string) => void
}) {
  return (
    <li className="crow">
      {item.card.imageSmall ? (
        <img className="crow__img" src={item.card.imageSmall} alt={item.card.name} loading="lazy" />
      ) : (
        <div className="crow__img crow__img--empty">No image</div>
      )}
      <div className="crow__body">
        <h3 className="crow__name">{item.card.name}</h3>
        <p className="crow__meta">
          {item.card.setName} · #{item.card.number}
        </p>
        <span className={`badge badge--${item.condition.toLowerCase()}`}>
          {item.condition} · {CONDITION_LABELS[item.condition]}
        </span>
      </div>
      <div className="crow__right">
        <div className="qty">
          <button
            className="qty__btn"
            aria-label="Decrease quantity"
            onClick={() => onQty(item.key, item.quantity - 1)}
          >
            −
          </button>
          <span className="qty__value">{item.quantity}</span>
          <button
            className="qty__btn"
            aria-label="Increase quantity"
            onClick={() => onQty(item.key, item.quantity + 1)}
          >
            +
          </button>
        </div>
        <span className="crow__value">{formatUsd(itemValue(item))}</span>
        <button
          className="crow__remove"
          aria-label={`Remove ${item.card.name}`}
          onClick={() => onRemove(item.key)}
        >
          Remove
        </button>
      </div>
    </li>
  )
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow camera permission and try again.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.'
  }
  return 'Could not start the camera on this device.'
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function CameraScanner({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('Live camera needs a secure (https) connection. You can still choose a photo below.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (e) {
        setErr(cameraErrorMessage(e))
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    stopCamera()
    onCapture(canvas.toDataURL('image/jpeg', 0.9))
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    stopCamera()
    onCapture(await readFileAsDataUrl(file))
  }

  return (
    <div className="scanner" role="dialog" aria-label="Scan a card">
      <div className="scanner__box">
        <div className="scanner__header">
          <h2>Scan a card</h2>
          <button
            className="scanner__close"
            aria-label="Close scanner"
            onClick={() => {
              stopCamera()
              onClose()
            }}
          >
            ✕
          </button>
        </div>

        {err ? (
          <p className="scanner__error">{err}</p>
        ) : (
          <>
            <div className="scanner__viewport">
              <video ref={videoRef} playsInline muted className="scanner__video" />
              <div className="scanner__frame" aria-hidden="true" />
            </div>
            <p className="scanner__hint">
              Line the card up inside the frame, then capture.
            </p>
          </>
        )}

        <div className="scanner__actions">
          {!err && (
            <button className="btn btn--primary" onClick={capture}>
              Capture
            </button>
          )}
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            Choose a photo
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={onFile}
        />
      </div>
    </div>
  )
}

function GradingGuide({ onZoom }: { onZoom: (src: string, alt: string) => void }) {
  const base = import.meta.env.BASE_URL
  return (
    <section className="guide">
      <p className="guide__intro">
        Condition drives a card's value. Compare your card to the examples below,
        then pick the closest grade when adding it. When in doubt, grade down.
      </p>
      {GRADE_GUIDE.map((g) => {
        const src = `${base}grading/${g.image}`
        const alt = `${CONDITION_LABELS[g.condition]} example card`
        return (
          <article className="grade" key={g.condition}>
            <button
              className="grade__imgbtn"
              onClick={() => onZoom(src, alt)}
              aria-label={`Enlarge ${CONDITION_LABELS[g.condition]} example`}
            >
              <img className="grade__img" src={src} alt={alt} loading="lazy" />
              <span className="grade__zoom" aria-hidden="true">⤢</span>
            </button>
            <div className="grade__body">
              <div className="grade__head">
                <span className={`badge badge--${g.condition.toLowerCase()}`}>
                  {g.condition}
                </span>
                <h3 className="grade__title">{CONDITION_LABELS[g.condition]}</h3>
                <span className="grade__mult">
                  ~{Math.round(CONDITION_MULTIPLIERS[g.condition] * 100)}% of NM
                </span>
              </div>
              <p className="grade__summary">{g.summary}</p>
              <ul className="grade__list">
                {g.lookFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        )
      })}
      <p className="disclaimer">
        Examples use a real Pokémon card (Base Set Charizard) with simulated wear to
        illustrate each grade — not photos of specific graded cards. Grading is
        subjective; professional graders (e.g. PSA/CGC) use stricter numeric scales.
      </p>
    </section>
  )
}

function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collection, setCollection] = useState<CollectionItem[]>(() => loadCollection())
  const [scanning, setScanning] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null)

  useEffect(() => {
    saveCollection(collection)
  }, [collection])

  async function runSearch(term: string) {
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      setResults(await searchCards(term))
    } catch (err) {
      setResults([])
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  async function handleScanCapture(dataUrl: string) {
    setScanning(false)
    setScanBusy(true)
    setError(null)
    setTab('search')
    try {
      const { name } = await scanCardName(dataUrl)
      if (!name) {
        setSearched(true)
        setResults([])
        setError(
          'Could not read a card name from that photo. Try again with good lighting, or type the name.',
        )
        return
      }
      setQuery(name)
      await runSearch(name)
    } catch {
      setError('Could not read the card. Please try again or type the name.')
    } finally {
      setScanBusy(false)
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    await runSearch(query)
  }

  function handleAdd(card: Card, condition: Condition) {
    setCollection((prev) => addToCollection(prev, card, condition))
  }

  function handleExportCsv() {
    // Prepend a UTF-8 BOM so Excel/Sheets render accented names correctly.
    const csv = '\uFEFF' + collectionToCsv(collection)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pokemon-tcg-collection-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const count = totalCards(collection)

  return (
    <div className="app">
      <header className="header">
        <img
          src={`${import.meta.env.BASE_URL}pokeball.svg`}
          alt=""
          className="logo"
          aria-hidden="true"
        />
        <h1>Card Collection</h1>
        <p className="tagline">Track your Pokémon TCG cards, conditions, and values.</p>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'search' ? 'tab--active' : ''}`}
          onClick={() => setTab('search')}
        >
          Search cards
        </button>
        <button
          className={`tab ${tab === 'collection' ? 'tab--active' : ''}`}
          onClick={() => setTab('collection')}
        >
          My collection{count > 0 ? ` (${count})` : ''}
        </button>
        <button
          className={`tab ${tab === 'guide' ? 'tab--active' : ''}`}
          onClick={() => setTab('guide')}
        >
          Grading guide
        </button>
      </nav>

      {tab === 'search' && (
        <section>
          <form className="search" onSubmit={handleSearch}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a card, e.g. Charizard"
              aria-label="Card name"
              autoFocus
            />
            <button className="btn btn--primary" type="submit" disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>

          <button
            className="btn btn--scan"
            onClick={() => setScanning(true)}
            disabled={scanBusy}
          >
            {scanBusy ? 'Reading card…' : '📷 Scan a card with your camera'}
          </button>

          {error && <p className="error" role="alert">{error}</p>}

          {!error && searched && !loading && results.length === 0 && (
            <p className="hint">No cards found. Try another name.</p>
          )}

          {!searched && !error && (
            <p className="hint">Search for a card, choose its condition, and add it to your collection.</p>
          )}

          <ul className="results">
            {results.map((card) => (
              <SearchResult key={card.id} card={card} onAdd={handleAdd} />
            ))}
          </ul>
        </section>
      )}

      {tab === 'collection' && (
        <section>
          <div className="summary">
            <div>
              <span className="summary__label">Cards</span>
              <span className="summary__value">{count}</span>
            </div>
            <div>
              <span className="summary__label">Est. value</span>
              <span className="summary__value summary__value--money">
                {formatUsd(totalValue(collection))}
              </span>
            </div>
          </div>

          {collection.length > 0 && (
            <div className="collection-toolbar">
              <button className="btn btn--ghost" onClick={handleExportCsv}>
                ⬇ Export CSV
              </button>
            </div>
          )}

          {collection.length === 0 ? (
            <p className="hint">
              Your collection is empty. Head to “Search cards” to add some.
            </p>
          ) : (
            <ul className="crows">
              {collection.map((item) => (
                <CollectionRow
                  key={item.key}
                  item={item}
                  onQty={(key, qty) => setCollection((prev) => setQuantity(prev, key, qty))}
                  onRemove={(key) => setCollection((prev) => removeItem(prev, key))}
                />
              ))}
            </ul>
          )}
          <p className="disclaimer">
            Values are estimates: Near Mint market price adjusted by condition. Actual
            prices vary by grade, edition, and market.
          </p>
        </section>
      )}

      {tab === 'guide' && <GradingGuide onZoom={(src, alt) => setZoom({ src, alt })} />}

      {zoom && (
        <div
          className="lightbox"
          role="dialog"
          aria-label={zoom.alt}
          onClick={() => setZoom(null)}
        >
          <img className="lightbox__img" src={zoom.src} alt={zoom.alt} />
          <button className="lightbox__close" aria-label="Close">
            ✕
          </button>
        </div>
      )}

      {scanning && (
        <CameraScanner onCapture={handleScanCapture} onClose={() => setScanning(false)} />
      )}

      {scanBusy && (
        <div className="scan-busy" role="status">
          <div className="scan-busy__spinner" aria-hidden="true" />
          <p>Reading card…</p>
        </div>
      )}
    </div>
  )
}

export default App
