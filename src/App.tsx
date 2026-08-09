import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import {
  CATALOG_LANGUAGES,
  fetchCardById,
  fetchSets,
  searchCards,
  type Card,
  type CardSet,
  type CatalogLanguage,
} from './tcgapi'
import { scanCardName } from './scan'
import { GRADE_GUIDE } from './grading'
import {
  cardToEbayQuery,
  ebaySoldSearchUrl,
  fetchHighestEbaySold,
  type EbayHighResult,
} from './ebay'
import {
  CONDITIONS,
  CONDITION_LABELS,
  CONDITION_MULTIPLIERS,
  PSA_GRADES,
  SORT_OPTIONS,
  type Condition,
  type CollectionItem,
  type PsaGrade,
  type SortKey,
  addToCollection,
  backupCardCount,
  collectionTemplateCsv,
  collectionToCsv,
  filterCollectionItems,
  formatUsd,
  gradingAdvice,
  hasCollectionBackup,
  itemValue,
  loadCollectionDetailed,
  mergeImportRows,
  ownedQuantityMap,
  parseCollectionCsv,
  removeItem,
  restoreCollectionBackup,
  saveCollection,
  setCondition,
  setPsaGrade,
  setQuantity,
  sortCards,
  sortCollectionItems,
  totalCards,
  totalValue,
  unitValue,
} from './collection'

type Tab = 'search' | 'collection' | 'guide'

function languageShort(lang: CatalogLanguage | undefined): string {
  const id = lang ?? 'en'
  return CATALOG_LANGUAGES.find((l) => l.id === id)?.short ?? id.toUpperCase()
}

/** Visible national Pokédex badge for search + catalog cards. */
function PokedexBadge({ n }: { n: number | null | undefined }) {
  if (n == null) return null
  return (
    <span className="badge badge--dex" title="National Pokédex number">
      Dex #{n}
    </span>
  )
}

function SortSelect({
  value,
  onChange,
  id,
}: {
  value: SortKey
  onChange: (k: SortKey) => void
  id?: string
}) {
  return (
    <label className="sort-control">
      <span className="sort-control__label">Sort</span>
      <select
        id={id}
        className="condition-select sort-control__select"
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        aria-label="Sort by"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {o.id === 'value'
              ? ' (high → low)'
              : o.id === 'pokedex'
                ? ' (low → high)'
                : ' (A → Z)'}
          </option>
        ))}
      </select>
    </label>
  )
}

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

function EbayHighPanel({
  card,
  psaGrade = null,
}: {
  card: Card
  psaGrade?: PsaGrade | null
}) {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; result: EbayHighResult }
    | { status: 'error'; message: string }
  >({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Clear cached panel when PSA changes so the next fetch matches the slab/raw line.
  useEffect(() => {
    setState({ status: 'idle' })
  }, [card.id, psaGrade])

  async function load(force = false) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setState({ status: 'loading' })
    try {
      const result = await fetchHighestEbaySold(cardToEbayQuery(card, psaGrade), {
        signal: ac.signal,
        force,
      })
      if (!ac.signal.aborted) setState({ status: 'ready', result })
    } catch (err) {
      if (ac.signal.aborted) return
      const message =
        err instanceof Error ? err.message : 'Could not load eBay sold prices.'
      setState({ status: 'error', message })
    }
  }

  const soldLink = ebaySoldSearchUrl(cardToEbayQuery(card, psaGrade))

  return (
    <div className="ebay-high">
      {state.status === 'idle' && (
        <button type="button" className="ebay-high__btn" onClick={() => void load()}>
          eBay 30-day high
        </button>
      )}
      {state.status === 'loading' && (
        <p className="ebay-high__status">Checking eBay sold…</p>
      )}
      {state.status === 'ready' && (
        <p className="ebay-high__result">
          <span className="ebay-high__label">eBay 30d high</span>{' '}
          {state.result.highest.url ? (
            <a
              className="ebay-high__price"
              href={state.result.highest.url}
              target="_blank"
              rel="noreferrer"
              title={state.result.highest.title}
            >
              {formatUsd(state.result.highest.price)}
            </a>
          ) : (
            <span className="ebay-high__price">
              {formatUsd(state.result.highest.price)}
            </span>
          )}
          <span className="ebay-high__meta">
            {' '}
            · {state.result.highest.soldAt}
            {state.result.saleCount > 1
              ? ` · ${state.result.saleCount} sales`
              : ''}
            {psaGrade != null && !state.result.gradeMatched
              ? ' · no exact PSA match'
              : ''}
          </span>{' '}
          <button
            type="button"
            className="ebay-high__refresh"
            onClick={() => void load(true)}
            aria-label="Refresh eBay high"
          >
            Refresh
          </button>
        </p>
      )}
      {state.status === 'error' && (
        <p className="ebay-high__error">
          {state.message}{' '}
          <a href={soldLink} target="_blank" rel="noreferrer">
            Open eBay sold
          </a>
          {' · '}
          <button type="button" className="ebay-high__refresh" onClick={() => void load(true)}>
            Retry
          </button>
        </p>
      )}
    </div>
  )
}

function SearchResult({
  card,
  onAdd,
  selected,
  onToggle,
  ownedQty,
}: {
  card: Card
  onAdd: (card: Card, condition: Condition) => void
  selected: boolean
  onToggle: (id: string) => void
  ownedQty: number
}) {
  const [condition, setCondition] = useState<Condition>('NM')
  const estimated =
    card.marketPrice == null
      ? null
      : card.marketPrice * CONDITION_MULTIPLIERS[condition]

  return (
    <li
      className={`result${selected ? ' result--selected' : ''}${ownedQty > 0 ? ' result--owned' : ''}`}
    >
      <label className="result__check">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(card.id)}
          aria-label={`Select ${card.name}`}
        />
      </label>
      {card.imageSmall ? (
        <img className="result__img" src={card.imageSmall} alt={card.name} loading="lazy" />
      ) : (
        <div className="result__img result__img--empty">No image</div>
      )}
      <div className="result__body">
        <h3 className="result__name">
          {card.name}
          {ownedQty > 0 && (
            <span className="badge badge--owned" title="Total copies in your catalog">
              In catalog ×{ownedQty}
            </span>
          )}
        </h3>
        <p className="result__meta">
          <span className="badge badge--lang">{languageShort(card.language)}</span>{' '}
          <PokedexBadge n={card.pokedexNumber} />{' '}
          {card.setName} · #{card.number}
          {card.rarity ? ` · ${card.rarity}` : ''}
        </p>
        <p className="result__price">
          <span>NM market: {formatUsd(card.marketPrice)}</span>
          {estimated != null && condition !== 'NM' && (
            <span className="result__price-est"> · {condition}: {formatUsd(estimated)}</span>
          )}
        </p>
        <EbayHighPanel card={card} />
        <div className="result__actions">
          <ConditionSelect value={condition} onChange={setCondition} />
          <button className="btn btn--add" onClick={() => onAdd(card, condition)}>
            {ownedQty > 0 ? '+ Add another' : '+ Add'}
          </button>
        </div>
      </div>
    </li>
  )
}

function CollectionRow({
  item,
  onQty,
  onCondition,
  onPsa,
  onRemove,
}: {
  item: CollectionItem
  onQty: (key: string, qty: number) => void
  onCondition: (key: string, condition: Condition) => void
  onPsa: (key: string, grade: PsaGrade | null) => void
  onRemove: (key: string) => void
}) {
  const advice = gradingAdvice(item)
  const unit = item.card.marketPrice == null ? null : unitValue(item)
  const [qtyDraft, setQtyDraft] = useState(String(item.quantity))

  // Keep the typed qty field in sync when quantity changes from +/− or merges.
  useEffect(() => {
    setQtyDraft(String(item.quantity))
  }, [item.quantity])

  function commitQty() {
    const n = Math.floor(Number(qtyDraft))
    if (!Number.isFinite(n) || n < 1) {
      setQtyDraft(String(item.quantity))
      return
    }
    if (n !== item.quantity) onQty(item.key, n)
  }

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
        <div className="crow__badges">
          <span className="badge badge--lang">{languageShort(item.card.language)}</span>
          <PokedexBadge n={item.card.pokedexNumber} />
          <span className={`badge badge--${item.condition.toLowerCase()}`}>
            {item.condition} · {CONDITION_LABELS[item.condition]}
          </span>
          {item.psaGrade != null && (
            <span className="badge badge--psa">PSA {item.psaGrade}</span>
          )}
        </div>
        <div className="crow__edit">
          <label className="crow__field">
            <span className="crow__field-label">Condition</span>
            <ConditionSelect
              value={item.condition}
              onChange={(c) => onCondition(item.key, c)}
              id={`cond-${item.key}`}
            />
          </label>
          <label className="crow__field">
            <span className="crow__field-label">PSA</span>
            <select
              className="condition-select"
              value={item.psaGrade ?? ''}
              aria-label={`PSA grade for ${item.card.name}`}
              onChange={(e) => {
                const v = e.target.value
                onPsa(item.key, v === '' ? null : (Number(v) as PsaGrade))
              }}
            >
              <option value="">Raw (ungraded)</option>
              {PSA_GRADES.map((g) => (
                <option key={g} value={g}>
                  PSA {g}
                </option>
              ))}
            </select>
          </label>
          <label className="crow__field crow__field--qty">
            <span className="crow__field-label">Qty</span>
            <div className="qty">
              <button
                type="button"
                className="qty__btn"
                aria-label="Decrease quantity"
                onClick={() => onQty(item.key, item.quantity - 1)}
              >
                −
              </button>
              <input
                className="qty__input"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={qtyDraft}
                aria-label={`Quantity for ${item.card.name}`}
                onChange={(e) => setQtyDraft(e.target.value)}
                onBlur={commitQty}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  }
                }}
              />
              <button
                type="button"
                className="qty__btn"
                aria-label="Increase quantity"
                onClick={() => onQty(item.key, item.quantity + 1)}
              >
                +
              </button>
            </div>
          </label>
        </div>
        <EbayHighPanel card={item.card} psaGrade={item.psaGrade} />
        {advice && (
          <p
            className={`crow__advice crow__advice--${advice.verdict}`}
            title={advice.detail}
          >
            <strong>{advice.label}</strong>
            <span>{advice.detail}</span>
          </p>
        )}
      </div>
      <div className="crow__right">
        <div className="crow__values">
          {unit != null && item.quantity > 1 && (
            <span className="crow__unit">{formatUsd(unit)} ea</span>
          )}
          <span className="crow__value">{formatUsd(itemValue(item))}</span>
        </div>
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
    return 'Camera access was blocked. Allow camera permission, or use “Take photo” below.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Live camera unavailable. Use “Take photo” below — it opens your phone camera.'
  }
  return 'Live camera unavailable. Use “Take photo” below — it opens your phone camera.'
}

/**
 * Start the rear camera when possible. Uses `ideal` (not required) facingMode
 * so iOS doesn't reject the request, then falls back to any camera.
 */
async function startCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('getUserMedia unavailable', 'NotSupportedError')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await startCameraStream()
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.setAttribute('playsinline', 'true')
          videoRef.current.muted = true
          await videoRef.current.play()
          setReady(true)
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
    e.target.value = ''
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
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="scanner__video"
              />
              <div className="scanner__frame" aria-hidden="true" />
            </div>
            <p className="scanner__hint">
              Line the card up inside the frame, then capture. Or tap “Take photo”
              to use your phone’s camera app.
            </p>
          </>
        )}

        <div className="scanner__actions">
          {!err && (
            <button className="btn btn--primary" onClick={capture} disabled={!ready}>
              {ready ? 'Capture' : 'Starting camera…'}
            </button>
          )}
          <button className="btn btn--primary" onClick={() => fileRef.current?.click()}>
            📷 Take photo
          </button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            Choose from library
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

function ScanSession({
  onAdd,
  onClose,
}: {
  onAdd: (card: Card, condition: Condition) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [camErr, setCamErr] = useState<string | null>(null)
  const [condition, setCondition] = useState<Condition>('NM')
  const [phase, setPhase] = useState<'capture' | 'reading' | 'result'>('capture')
  const [matches, setMatches] = useState<Card[]>([])
  const [selected, setSelected] = useState<Card | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)
  const [addedNames, setAddedNames] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await startCameraStream()
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.setAttribute('playsinline', 'true')
          videoRef.current.muted = true
          await videoRef.current.play()
        }
      } catch (e) {
        setCamErr(cameraErrorMessage(e))
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

  async function process(dataUrl: string) {
    setPhase('reading')
    setResultMsg(null)
    try {
      const { name } = await scanCardName(dataUrl)
      if (!name) {
        setMatches([])
        setSelected(null)
        setResultMsg('Could not read the card name. Try again with better lighting.')
        setPhase('result')
        return
      }
      const found = await searchCards(name)
      if (found.length === 0) {
        setMatches([])
        setSelected(null)
        setResultMsg(`No matches found for "${name}".`)
        setPhase('result')
        return
      }
      setMatches(found.slice(0, 6))
      setSelected(found[0])
      setPhase('result')
    } catch {
      setMatches([])
      setSelected(null)
      setResultMsg('Something went wrong reading that card. Please try again.')
      setPhase('result')
    }
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
    process(canvas.toDataURL('image/jpeg', 0.9))
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow selecting the same file again next round
    process(await readFileAsDataUrl(file))
  }

  function addSelected() {
    if (selected) {
      onAdd(selected, condition)
      setAddedCount((c) => c + 1)
      setAddedNames((n) => [selected.name, ...n].slice(0, 6))
      setToast(`Added ${selected.name} (${condition})`)
      window.setTimeout(() => setToast(null), 1600)
    }
    setPhase('capture')
  }

  function finish() {
    stopCamera()
    onClose()
  }

  return (
    <div className="scanner" role="dialog" aria-label="Scan session">
      <div className="scanner__box">
        <div className="scanner__header">
          <h2>Scan session</h2>
          <button className="scanner__close" aria-label="Finish scanning" onClick={finish}>
            Done
          </button>
        </div>

        <div className="session__bar">
          <label className="session__cond">
            Add as{' '}
            <ConditionSelect value={condition} onChange={setCondition} />
          </label>
          <span className="session__count">Added: {addedCount}</span>
        </div>

        <div className="scanner__viewport">
          {camErr ? (
            <div className="session__camerr">{camErr}</div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="scanner__video"
            />
          )}
          {!camErr && phase === 'capture' && <div className="scanner__frame" aria-hidden="true" />}

          {phase === 'reading' && (
            <div className="session__overlay">
              <div className="scan-busy__spinner" aria-hidden="true" />
              <p>Reading card…</p>
            </div>
          )}

          {phase === 'result' && (
            <div className="session__overlay session__overlay--result">
              {selected ? (
                <>
                  <div className="session__match">
                    {selected.imageSmall && (
                      <img src={selected.imageSmall} alt={selected.name} />
                    )}
                    <div>
                      <strong>{selected.name}</strong>
                      <span>
                        {selected.setName} · #{selected.number}
                        {selected.pokedexNumber != null
                          ? ` · Dex #${selected.pokedexNumber}`
                          : ''}
                      </span>
                      <span>NM market: {formatUsd(selected.marketPrice)}</span>
                    </div>
                  </div>
                  {matches.length > 1 && (
                    <div className="session__alts">
                      <span className="session__alts-label">Not right? Pick one:</span>
                      <div className="session__alts-row">
                        {matches.map((m) => (
                          <button
                            key={m.id}
                            className={`session__alt ${selected.id === m.id ? 'session__alt--on' : ''}`}
                            onClick={() => setSelected(m)}
                            title={`${m.name} · ${m.setName}`}
                          >
                            {m.imageSmall && <img src={m.imageSmall} alt={m.name} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="session__resultbtns">
                    <button className="btn btn--add" onClick={addSelected}>
                      + Add ({condition})
                    </button>
                    <button className="btn btn--ghost" onClick={() => setPhase('capture')}>
                      Skip
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="session__err">{resultMsg}</p>
                  <button className="btn btn--primary" onClick={() => setPhase('capture')}>
                    Try again
                  </button>
                </>
              )}
            </div>
          )}

          {toast && <div className="session__toast">{toast} ✓</div>}
        </div>

        {phase === 'capture' && (
          <div className="scanner__actions">
            {!camErr && (
              <button className="btn btn--primary" onClick={capture}>
                Capture
              </button>
            )}
            <button className="btn btn--primary" onClick={() => fileRef.current?.click()}>
              📷 Take photo
            </button>
            <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
              Choose from library
            </button>
          </div>
        )}

        {addedNames.length > 0 && (
          <ul className="session__added">
            {addedNames.map((n, i) => (
              <li key={`${n}-${i}`}>{n}</li>
            ))}
          </ul>
        )}

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

function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([])
  const [catalogLang, setCatalogLang] = useState<CatalogLanguage>('en')
  const [sets, setSets] = useState<CardSet[]>([])
  const [setsError, setSetsError] = useState<string | null>(null)
  const [setsLoading, setSetsLoading] = useState(false)
  /** Bump to re-fetch sets after a failure (pokemontcg.io is often flaky). */
  const [setsReloadToken, setSetsReloadToken] = useState(0)
  const [results, setResults] = useState<Card[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bootRef = useRef<ReturnType<typeof loadCollectionDetailed> | null>(null)
  if (!bootRef.current) {
    bootRef.current = loadCollectionDetailed()
  }
  const [collection, setCollection] = useState<CollectionItem[]>(
    () => bootRef.current!.items,
  )
  const [persistMsg, setPersistMsg] = useState<string | null>(() => {
    // Prefer the one-shot restore notice (survives Strict Mode remount).
    try {
      const notice = sessionStorage.getItem('pokedex.collection.restoreNotice')
      if (notice) {
        sessionStorage.removeItem('pokedex.collection.restoreNotice')
        return notice
      }
    } catch {
      // ignore
    }
    return bootRef.current!.message
  })
  const [scanning, setScanning] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCondition, setBulkCondition] = useState<Condition>('NM')
  const [searchSort, setSearchSort] = useState<SortKey>('name')
  const [collectionSort, setCollectionSort] = useState<SortKey>('name')
  const [collectionFilter, setCollectionFilter] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  /** Skip the first effect pass so a failed/empty hydrate cannot wipe storage. */
  const persistReadyRef = useRef(false)
  const loadSourceRef = useRef(bootRef.current.source)

  const ownedById = useMemo(() => ownedQuantityMap(collection), [collection])
  const sortedResults = useMemo(
    () => sortCards(results, searchSort),
    [results, searchSort],
  )
  const visibleCollection = useMemo(() => {
    const filtered = filterCollectionItems(collection, collectionFilter)
    return sortCollectionItems(filtered, collectionSort)
  }, [collection, collectionFilter, collectionSort])
  const count = totalCards(collection)

  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true
      // Rewrite migrated shape (e.g. add psaGrade) only when we actually loaded items.
      if (collection.length > 0) {
        saveCollection(collection)
      }
      return
    }
    // Never let an accidental empty state clobber a non-empty primary after a
    // corrupt/failed hydrate — backup restore UI covers intentional recovery.
    const allowEmptyOverwrite = loadSourceRef.current !== 'corrupt-empty'
    saveCollection(collection, { allowEmptyOverwrite })
    if (collection.length > 0) {
      loadSourceRef.current = 'primary'
    }
  }, [collection])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSetsLoading(true)
      setSetsError(null)
      try {
        const list = await fetchSets(catalogLang)
        if (!cancelled) {
          setSets(list)
          setSetsError(null)
        }
      } catch {
        if (!cancelled) {
          setSets([])
          setSetsError('Could not load sets. You can still search by name.')
        }
      } finally {
        if (!cancelled) setSetsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalogLang, setsReloadToken])

  // Reset set selection when switching catalog language.
  useEffect(() => {
    setSelectedSetIds([])
  }, [catalogLang])

  async function runSearch(opts: {
    name?: string
    setIds?: string[]
    number?: string
    language?: CatalogLanguage
  }) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setSearched(true)
    setSelectedIds(new Set())
    try {
      setResults(
        await searchCards({
          name: opts.name,
          setIds: opts.setIds,
          number: opts.number,
          language: opts.language ?? catalogLang,
          signal: controller.signal,
        }),
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Search cancelled.')
        return
      }
      setResults([])
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      if (abortRef.current === controller) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }

  function cancelSearch() {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
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
      await runSearch({
        name,
        setIds: selectedSetIds.length > 0 ? selectedSetIds : undefined,
        number: cardNumber || undefined,
        language: catalogLang,
      })
    } catch {
      setError('Could not read the card. Please try again or type the name.')
    } finally {
      setScanBusy(false)
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    await runSearch({
      name: query,
      setIds: selectedSetIds.length > 0 ? selectedSetIds : undefined,
      number: cardNumber || undefined,
      language: catalogLang,
    })
  }

  function addSetFilter(id: string) {
    if (!id) return
    setSelectedSetIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  function removeSetFilter(id: string) {
    setSelectedSetIds((prev) => prev.filter((x) => x !== id))
  }

  function handleAdd(card: Card, condition: Condition) {
    setCollection((prev) => addToCollection(prev, card, condition))
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === sortedResults.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedResults.map((c) => c.id)))
    }
  }

  function handleAddSelected() {
    const chosen = sortedResults.filter((c) => selectedIds.has(c.id))
    if (chosen.length === 0) return
    setCollection((prev) => {
      let next = prev
      for (const card of chosen) {
        next = addToCollection(next, card, bulkCondition)
      }
      return next
    })
    setSelectedIds(new Set())
  }

  function handleAddAllOnPage() {
    if (sortedResults.length === 0) return
    setCollection((prev) => {
      let next = prev
      for (const card of sortedResults) {
        next = addToCollection(next, card, bulkCondition)
      }
      return next
    })
    setSelectedIds(new Set())
  }

  function handleExportCsv() {
    // Prepend a UTF-8 BOM so Excel/Sheets render accented names correctly.
    const csv = '\uFEFF' + collectionToCsv(collection)
    downloadTextFile(
      `pokemon-tcg-collection-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8;',
    )
  }

  function handleDownloadTemplate() {
    downloadTextFile(
      'pokemon-tcg-collection-template.csv',
      '\uFEFF' + collectionTemplateCsv(),
      'text/csv;charset=utf-8;',
    )
  }

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportBusy(true)
    setImportMsg(null)
    try {
      const text = await file.text()
      const parsed = parseCollectionCsv(text)
      if (parsed.rows.length === 0) {
        setImportMsg(
          parsed.errors[0] ??
            'No valid rows found. Download the CSV template for the expected format.',
        )
        return
      }

      const resolved: {
        card: Card
        condition: Condition
        psaGrade: PsaGrade | null
        quantity: number
      }[] = []
      const lookupErrors: string[] = [...parsed.errors]

      // Parallel lookups (batched) — serial import is too slow for ~hundreds of rows.
      const concurrency = 8
      for (let i = 0; i < parsed.rows.length; i += concurrency) {
        const batch = parsed.rows.slice(i, i + concurrency)
        setImportMsg(
          `Importing… ${Math.min(i + batch.length, parsed.rows.length)} / ${parsed.rows.length}`,
        )
        const settled = await Promise.all(
          batch.map(async (row) => {
            try {
              const card = await fetchCardById(row.cardId)
              if (!card) {
                return {
                  ok: false as const,
                  error: `Line ${row.lineNumber}: unknown Card ID "${row.cardId}"${row.name ? ` (${row.name})` : ''}.`,
                }
              }
              return {
                ok: true as const,
                row: {
                  card,
                  condition: row.condition,
                  psaGrade: row.psaGrade,
                  quantity: row.quantity,
                },
              }
            } catch {
              return {
                ok: false as const,
                error: `Line ${row.lineNumber}: could not look up Card ID "${row.cardId}".`,
              }
            }
          }),
        )
        for (const item of settled) {
          if (item.ok) resolved.push(item.row)
          else lookupErrors.push(item.error)
        }
      }

      if (resolved.length > 0) {
        setCollection((prev) => mergeImportRows(prev, resolved))
      }

      const parts = [`Imported ${resolved.length} of ${parsed.rows.length} row(s).`]
      if (lookupErrors.length > 0) {
        parts.push(`${lookupErrors.length} issue(s): ${lookupErrors.slice(0, 3).join(' ')}`)
        if (lookupErrors.length > 3) parts.push('…')
      }
      setImportMsg(parts.join(' '))
    } catch {
      setImportMsg('Could not read that CSV file. Download the template and try again.')
    } finally {
      setImportBusy(false)
    }
  }

  const isHomeEmpty = tab === 'search' && !searched && !loading && !error && results.length === 0

  return (
    <>
      <div className={`app${isHomeEmpty ? ' app--home' : ''}`}>
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
        <section className={isHomeEmpty ? 'home-panel' : undefined}>
          <form className="search-form" onSubmit={handleSearch}>
            <label className="set-filter lang-filter">
              <span className="set-filter__label">Lang</span>
              <select
                className="condition-select set-filter__select"
                value={catalogLang}
                onChange={(e) => {
                  setCatalogLang(e.target.value as CatalogLanguage)
                  setResults([])
                  setSearched(false)
                  setError(null)
                }}
                aria-label="Catalog language"
              >
                {CATALOG_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="search">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  catalogLang === 'en'
                    ? 'Card name (optional)'
                    : 'English or local name (e.g. Flareon)'
                }
                aria-label="Card name"
                autoFocus
              />
              {loading ? (
                <button className="btn btn--ghost" type="button" onClick={cancelSearch}>
                  Cancel
                </button>
              ) : (
                <button className="btn btn--primary" type="submit">
                  Search
                </button>
              )}
            </div>
            <div className="search-filters">
              <label className="set-filter">
                <span className="set-filter__label">#</span>
                <input
                  className="set-filter__input"
                  type="text"
                  inputMode="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="Card # (e.g. 4)"
                  aria-label="Card number"
                />
              </label>
              <label className="set-filter">
                <span className="set-filter__label">Sets</span>
                <select
                  className="condition-select set-filter__select"
                  value=""
                  onChange={(e) => addSetFilter(e.target.value)}
                  aria-label="Add set filter"
                  disabled={setsLoading}
                >
                  <option value="">
                    {setsLoading
                      ? 'Loading sets…'
                      : selectedSetIds.length > 0
                        ? 'Add another set…'
                        : 'Add set…'}
                  </option>
                  {sets
                    .filter((s) => !selectedSetIds.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {catalogLang === 'en' && s.series ? ` (${s.series})` : ''}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {selectedSetIds.length > 0 && (
              <div className="set-chips" aria-label="Selected sets">
                {selectedSetIds.map((id) => {
                  const set = sets.find((s) => s.id === id)
                  const label = set?.name ?? id
                  return (
                    <button
                      key={id}
                      type="button"
                      className="set-chip"
                      onClick={() => removeSetFilter(id)}
                      title={`Remove ${label}`}
                    >
                      <span className="set-chip__name">{label}</span>
                      <span className="set-chip__x" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="set-chips__clear"
                  onClick={() => setSelectedSetIds([])}
                >
                  Clear sets
                </button>
              </div>
            )}
            {(setsError || setsLoading) && (
              <div className="sets-status">
                {setsLoading && (
                  <p className="hint sets-status__msg">Loading sets…</p>
                )}
                {setsError && !setsLoading && (
                  <>
                    <p className="hint sets-status__msg">{setsError}</p>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setSetsReloadToken((n) => n + 1)}
                    >
                      Retry sets
                    </button>
                  </>
                )}
              </div>
            )}
            {catalogLang !== 'en' && (
              <p className="hint lang-hint">
                Asian catalogs come from TCGdex. Type an <strong>English</strong>{' '}
                name (e.g. Flareon) or the local name — Lang filters which print
                language you get (JP / ZH / KO). Prices are Cardmarket estimates
                when available.
              </p>
            )}
          </form>

          <div className="scan-buttons">
            <button
              className="btn btn--scan"
              onClick={() => setScanning(true)}
              disabled={scanBusy}
            >
              {scanBusy ? 'Reading card…' : '📷 Scan a card'}
            </button>
            <button className="btn btn--scan" onClick={() => setSessionOpen(true)}>
              🔁 Scan session (add many)
            </button>
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          {!error && searched && !loading && results.length === 0 && (
            <p className="hint">No cards found. Try another name, number, or set.</p>
          )}

          {!searched && !error && (
            <p className="hint">
              Search by name, card #, and one or more sets. Add sets from the
              dropdown (tap a chip to remove). Switch Lang for Japanese / Chinese /
              Korean — English names still work. Check multiple cards to add them
              at once.
            </p>
          )}

          {sortedResults.length > 0 && (
            <div className="bulk-bar">
              <label className="bulk-bar__all">
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size > 0 && selectedIds.size === sortedResults.length
                  }
                  onChange={toggleSelectAll}
                />
                <span>
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : 'Select all'}
                </span>
              </label>
              <SortSelect value={searchSort} onChange={setSearchSort} id="search-sort" />
              <ConditionSelect value={bulkCondition} onChange={setBulkCondition} />
              <button
                className="btn btn--add"
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleAddSelected}
              >
                + Add selected ({selectedIds.size})
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={handleAddAllOnPage}
                title="Add every card on this results page"
              >
                + Add all on page ({sortedResults.length})
              </button>
            </div>
          )}

          <ul className="results">
            {sortedResults.map((card) => (
              <SearchResult
                key={card.id}
                card={card}
                onAdd={handleAdd}
                selected={selectedIds.has(card.id)}
                onToggle={toggleSelected}
                ownedQty={ownedById.get(card.id) ?? 0}
              />
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

          {persistMsg && (
            <div className="persist-banner" role="status">
              <p>{persistMsg}</p>
              <button
                type="button"
                className="persist-banner__dismiss"
                onClick={() => setPersistMsg(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="collection-toolbar">
            <button className="btn btn--ghost" onClick={handleDownloadTemplate}>
              📄 CSV template
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => importRef.current?.click()}
              disabled={importBusy}
            >
              {importBusy ? 'Importing…' : '⬆ Import CSV'}
            </button>
            {collection.length > 0 && (
              <button className="btn btn--ghost" onClick={handleExportCsv}>
                ⬇ Export CSV
              </button>
            )}
            {collection.length === 0 && hasCollectionBackup() && (
              <button
                className="btn btn--add"
                type="button"
                onClick={() => {
                  const restored = restoreCollectionBackup()
                  if (restored) {
                    loadSourceRef.current = 'backup'
                    setCollection(restored)
                    setPersistMsg(
                      `Restored ${totalCards(restored)} card(s) from the automatic backup.`,
                    )
                  }
                }}
              >
                ↺ Restore backup ({backupCardCount()})
              </button>
            )}
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={handleImportCsv}
            />
          </div>

          {collection.length > 0 && (
            <div className="collection-controls">
              <label className="collection-filter">
                <span className="collection-filter__label">Find</span>
                <input
                  className="collection-filter__input"
                  type="search"
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                  placeholder="Filter by name, set, Dex #…"
                  aria-label="Filter collection"
                />
              </label>
              <SortSelect
                value={collectionSort}
                onChange={setCollectionSort}
                id="collection-sort"
              />
            </div>
          )}

          {importMsg && <p className="hint import-msg">{importMsg}</p>}

          {collection.length === 0 ? (
            <div className="empty-collection">
              <p className="hint">
                Your collection is empty on this device/browser. For large inventories (~hundreds
                of cards), use <strong>CSV import</strong> (download the template), or browse a
                set and tap <strong>+ Add all on page</strong>. You can also use Scan session for
                a physical pile.
              </p>
              <p className="hint empty-collection__warn">
                Inventory is stored only in this browser (not in the cloud). Prefer{' '}
                <strong>Export CSV</strong> as your safety copy. On iPhone, open the site in
                Safari (same bookmark) before re-adding a home-screen icon — deleting the icon
                can wipe that app’s local data.
              </p>
            </div>
          ) : visibleCollection.length === 0 ? (
            <p className="hint">No cards match that filter.</p>
          ) : (
            <ul className="crows">
              {visibleCollection.map((item) => (
                <CollectionRow
                  key={item.key}
                  item={item}
                  onQty={(key, qty) => setCollection((prev) => setQuantity(prev, key, qty))}
                  onCondition={(key, condition) =>
                    setCollection((prev) => setCondition(prev, key, condition))
                  }
                  onPsa={(key, grade) => setCollection((prev) => setPsaGrade(prev, key, grade))}
                  onRemove={(key) => setCollection((prev) => removeItem(prev, key))}
                />
              ))}
            </ul>
          )}
          {collection.length > 0 && (
            <p className="hint persist-tip">
              Showing {visibleCollection.length} line(s) · {count} card(s) total. Tip: tap{' '}
              <strong>Export CSV</strong> periodically — inventory lives on this device only.
            </p>
          )}
          <p className="disclaimer">
            Values are estimates: raw cards use condition multipliers; PSA slabs use rough
            grade multipliers vs NM market. eBay 30-day high is the top completed sale from
            recent comps (not part of the collection total). “Worth grading?” compares an
            estimated PSA 10 minus typical fees (~$40) to your raw value — not financial
            advice. CSV import needs a Card ID column (and optional PSA Grade) — use the
            template or an export.
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

      {sessionOpen && (
        <ScanSession
          onAdd={(card, condition) => handleAdd(card, condition)}
          onClose={() => setSessionOpen(false)}
        />
      )}

      {scanBusy && (
        <div className="scan-busy" role="status">
          <div className="scan-busy__spinner" aria-hidden="true" />
          <p>Reading card…</p>
        </div>
      )}
      </div>

      <div className="rotate-lock">
        <img
          src={`${import.meta.env.BASE_URL}pokeball.svg`}
          alt=""
          className="rotate-lock__logo"
          aria-hidden="true"
        />
        <p>Please rotate your device to portrait to use the app.</p>
      </div>
    </>
  )
}

export default App
