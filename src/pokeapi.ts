const API_BASE = 'https://pokeapi.co/api/v2'

export interface PokemonStat {
  name: string
  value: number
}

export interface Pokemon {
  id: number
  name: string
  spriteUrl: string | null
  types: string[]
  height: number // decimetres
  weight: number // hectograms
  stats: PokemonStat[]
}

interface RawPokemon {
  id: number
  name: string
  height: number
  weight: number
  sprites: {
    front_default: string | null
    other?: {
      ['official-artwork']?: {
        front_default: string | null
      }
    }
  }
  types: { type: { name: string } }[]
  stats: { base_stat: number; stat: { name: string } }[]
}

/**
 * Fetch a single Pokémon by name or numeric id.
 * Throws an Error with a friendly message when the Pokémon does not exist.
 */
export async function fetchPokemon(query: string): Promise<Pokemon> {
  const slug = query.trim().toLowerCase()
  if (!slug) {
    throw new Error('Please enter a Pokémon name or number.')
  }

  const res = await fetch(`${API_BASE}/pokemon/${encodeURIComponent(slug)}`)
  if (res.status === 404) {
    throw new Error(`No Pokémon found for "${query}". Try another name or number.`)
  }
  if (!res.ok) {
    throw new Error(`Something went wrong (HTTP ${res.status}). Please try again.`)
  }

  const data = (await res.json()) as RawPokemon
  const artwork = data.sprites.other?.['official-artwork']?.front_default ?? null

  return {
    id: data.id,
    name: data.name,
    spriteUrl: artwork ?? data.sprites.front_default,
    types: data.types.map((t) => t.type.name),
    height: data.height,
    weight: data.weight,
    stats: data.stats.map((s) => ({ name: s.stat.name, value: s.base_stat })),
  }
}
