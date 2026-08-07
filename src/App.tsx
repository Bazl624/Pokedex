import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import { searchCards, type Card } from './tcgapi'
import {
  CONDITIONS,
  CONDITION_LABELS,
  CONDITION_MULTIPLIERS,
  type Condition,
  type CollectionItem,
  addToCollection,
  formatUsd,
  itemValue,
  loadCollection,
  removeItem,
  saveCollection,
  setQuantity,
  totalCards,
  totalValue,
} from './collection'

type Tab = 'search' | 'collection'

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

function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collection, setCollection] = useState<CollectionItem[]>(() => loadCollection())

  useEffect(() => {
    saveCollection(collection)
  }, [collection])

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      setResults(await searchCards(query))
    } catch (err) {
      setResults([])
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  function handleAdd(card: Card, condition: Condition) {
    setCollection((prev) => addToCollection(prev, card, condition))
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
    </div>
  )
}

export default App
