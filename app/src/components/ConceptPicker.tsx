import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { BLOCK_TYPE_SHORT, type Concept } from '../types'

interface Props {
  title: string
  /** Klocki wykluczone z listy (np. sam edytowany klocek). */
  excludeIds?: string[]
  onPick: (concept: Concept) => void
  onClose: () => void
}

/** Okno wyboru klocka — używane przy wskazywaniu źródła-klocka
 *  i przy dodawaniu relacji między pojęciami. */
export function ConceptPicker({ title, excludeIds = [], onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const found = concepts
    .filter((c) => !excluded.has(c.id))
    .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    .slice(0, 80)

  return (
    <div className="note-modal-backdrop" onClick={onClose}>
      <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
        <header className="note-modal-head">
          <h3>{title}</h3>
          <button className="btn btn-close" title="Zamknij (Escape)" onClick={onClose}>
            ✕
          </button>
        </header>
        <input
          className="input picker-search"
          autoFocus
          value={q}
          placeholder="Szukaj klocka po nazwie…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && found.length > 0) onPick(found[0])
          }}
        />
        <div className="picker-list">
          {found.length === 0 && <p className="pdflib-empty">Nic nie pasuje.</p>}
          {found.map((c) => (
            <button key={c.id} className="picker-item" onClick={() => onPick(c)}>
              <span className={`type-mini type-${c.type}`}>
                {BLOCK_TYPE_SHORT[c.type]}
              </span>
              <span className="picker-item-name">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
