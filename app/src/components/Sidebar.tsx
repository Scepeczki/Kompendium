import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createConcept, db } from '../db'
import { BLOCK_TYPE_LABELS, BLOCK_TYPES, type BlockType } from '../types'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function Sidebar({ selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<BlockType | 'wszystkie'>('wszystkie')

  // Domyślne sortowanie: oś zdobywania wiedzy (kolejność powstawania).
  const concepts =
    useLiveQuery(() => db.concepts.orderBy('createdAt').toArray(), []) ?? []

  const visible = concepts.filter((c) => {
    if (typeFilter !== 'wszystkie' && c.type !== typeFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
    )
  })

  const handleNew = async () => {
    const id = await createConcept()
    onSelect(id)
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1 className="app-title">Kompendium</h1>
        <button className="btn btn-primary" onClick={handleNew}>
          + Nowy klocek
        </button>
      </header>

      <div className="sidebar-filters">
        <input
          className="input"
          type="search"
          placeholder="Szukaj po nazwie lub tagu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as BlockType | 'wszystkie')}
        >
          <option value="wszystkie">Wszystkie typy</option>
          {BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {BLOCK_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <ul className="concept-list">
        {visible.length === 0 && (
          <li className="concept-empty">
            {concepts.length === 0
              ? 'Brak klocków. Utwórz pierwszy!'
              : 'Nic nie pasuje do filtra.'}
          </li>
        )}
        {visible.map((c) => (
          <li key={c.id}>
            <button
              className={`concept-item ${c.id === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <span className={`type-badge type-${c.type}`}>
                {BLOCK_TYPE_LABELS[c.type]}
              </span>
              <span className="concept-name">{c.name}</span>
              {c.tags.length > 0 && (
                <span className="concept-tags">
                  {c.tags.map((t) => `#${t}`).join(' ')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
