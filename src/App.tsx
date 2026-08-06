import { useState, type FormEvent } from 'react'
import './App.css'
import { fetchPokemon, type Pokemon } from './pokeapi'

const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a77a',
  fire: '#ee8130',
  water: '#6390f0',
  electric: '#f7d02c',
  grass: '#7ac74c',
  ice: '#96d9d6',
  fighting: '#c22e28',
  poison: '#a33ea1',
  ground: '#e2bf65',
  flying: '#a98ff3',
  psychic: '#f95587',
  bug: '#a6b91a',
  rock: '#b6a136',
  ghost: '#735797',
  dragon: '#6f35fc',
  dark: '#705746',
  steel: '#b7b7ce',
  fairy: '#d685ad',
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

function App() {
  const [query, setQuery] = useState('')
  const [pokemon, setPokemon] = useState<Pokemon | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await fetchPokemon(query)
      setPokemon(result)
    } catch (err) {
      setPokemon(null)
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <img src="/pokeball.svg" alt="" className="logo" aria-hidden="true" />
        <h1>Pokédex</h1>
        <p className="tagline">Search for any Pokémon by name or number.</p>
      </header>

      <form className="search" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. pikachu or 25"
          aria-label="Pokémon name or number"
          autoFocus
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {pokemon && (
        <section className="card" aria-live="polite">
          <div className="card__header">
            <span className="card__id">#{String(pokemon.id).padStart(3, '0')}</span>
            <h2 className="card__name">{pokemon.name}</h2>
          </div>

          {pokemon.spriteUrl ? (
            <img
              className="card__sprite"
              src={pokemon.spriteUrl}
              alt={pokemon.name}
              width={240}
              height={240}
            />
          ) : (
            <div className="card__sprite card__sprite--empty">No image</div>
          )}

          <div className="types">
            {pokemon.types.map((type) => (
              <span
                key={type}
                className="type"
                style={{ backgroundColor: TYPE_COLORS[type] ?? '#777' }}
              >
                {type}
              </span>
            ))}
          </div>

          <div className="measurements">
            <div>
              <span className="measurements__label">Height</span>
              <span className="measurements__value">{pokemon.height / 10} m</span>
            </div>
            <div>
              <span className="measurements__label">Weight</span>
              <span className="measurements__value">{pokemon.weight / 10} kg</span>
            </div>
          </div>

          <ul className="stats">
            {pokemon.stats.map((stat) => (
              <li key={stat.name} className="stat">
                <span className="stat__label">{STAT_LABELS[stat.name] ?? stat.name}</span>
                <span className="stat__bar">
                  <span
                    className="stat__fill"
                    style={{ width: `${Math.min(100, (stat.value / 255) * 100)}%` }}
                  />
                </span>
                <span className="stat__value">{stat.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!pokemon && !error && !loading && (
        <p className="hint">Try “bulbasaur”, “charizard”, or “150”.</p>
      )}
    </div>
  )
}

export default App
