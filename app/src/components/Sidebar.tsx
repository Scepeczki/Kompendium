import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createConcept,
  createFolder,
  db,
  deleteFolder,
  moveConcept,
  renameFolder,
} from '../db'
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  type BlockType,
  type Concept,
  type Folder,
} from '../types'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Ładunek przeciągania (klocek albo folder). */
type DragPayload = { kind: 'concept' | 'folder'; id: string }

/** Podpowiedź wizualna miejsca upuszczenia. */
type DropHint = { id: string; pos: 'into' | 'before' | 'after' } | null

const MIME = 'text/x-kompendium'
const EXP_KEY = 'ui.expandedFolders'

const loadExpanded = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXP_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const setDragData = (e: React.DragEvent, payload: DragPayload) => {
  e.dataTransfer.setData(MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'move'
}

const getDragData = (e: React.DragEvent): DragPayload | null => {
  try {
    const raw = e.dataTransfer.getData(MIME)
    return raw ? (JSON.parse(raw) as DragPayload) : null
  } catch {
    return null
  }
}

export function Sidebar({ selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<BlockType | 'wszystkie'>('wszystkie')
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)
  const [dropHint, setDropHint] = useState<DropHint>(null)
  const [rootHint, setRootHint] = useState(false)

  const folders =
    useLiveQuery(() => db.folders.where('kind').equals('concepts').toArray(), []) ?? []
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []

  const filtering = search.trim() !== '' || typeFilter !== 'wszystkie'

  const childFolders = (parentId: string | null) =>
    folders
      .filter((f) => (f.parentId ?? null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'))

  const childConcepts = (folderId: string | null) =>
    concepts
      .filter((c) => (c.folderId ?? null) === folderId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(EXP_KEY, JSON.stringify([...next]))
      return next
    })
  }

  /** Czy folder `candidate` leży wewnątrz folderu `ancestor` (dowolnie głęboko). */
  const isInside = (candidateId: string, ancestorId: string): boolean => {
    let cur = folders.find((f) => f.id === candidateId)
    while (cur) {
      if (cur.parentId === ancestorId) return true
      cur = folders.find((f) => f.id === cur!.parentId)
    }
    return false
  }

  const clearHints = () => {
    setDropHint(null)
    setRootHint(false)
  }

  const dropOnFolder = async (payload: DragPayload, folderId: string) => {
    if (payload.kind === 'concept') {
      await moveConcept(payload.id, folderId)
    } else {
      // folder nie może wejść w samego siebie ani we własne wnętrze
      if (payload.id === folderId || isInside(folderId, payload.id)) return
      await db.folders.update(payload.id, { parentId: folderId })
    }
    setExpanded((prev) => {
      const next = new Set(prev).add(folderId)
      localStorage.setItem(EXP_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const dropOnConcept = async (
    payload: DragPayload,
    target: Concept,
    pos: 'before' | 'after',
  ) => {
    if (payload.kind !== 'concept' || payload.id === target.id) return
    const siblings = childConcepts(target.folderId ?? null)
    const i = siblings.findIndex((c) => c.id === target.id)
    let order: number
    if (pos === 'before') {
      const prev = siblings[i - 1]
      order = prev ? ((prev.order ?? 0) + (target.order ?? 0)) / 2 : (target.order ?? 0) - 1
    } else {
      const next = siblings[i + 1]
      order = next ? ((next.order ?? 0) + (target.order ?? 0)) / 2 : (target.order ?? 0) + 1
    }
    await moveConcept(payload.id, target.folderId ?? null, order)
  }

  const dropOnRoot = async (payload: DragPayload) => {
    if (payload.kind === 'concept') await moveConcept(payload.id, null)
    else await db.folders.update(payload.id, { parentId: null })
  }

  const handleNew = async () => {
    const id = await createConcept()
    onSelect(id)
  }

  const handleNewFolder = async () => {
    const name = window.prompt('Nazwa folderu:')
    if (!name?.trim()) return
    await createFolder('concepts', name.trim())
  }

  const handleRenameFolder = async (f: Folder) => {
    const name = window.prompt('Nowa nazwa folderu:', f.name)
    if (!name?.trim()) return
    await renameFolder(f.id, name.trim())
  }

  const handleDeleteFolder = async (f: Folder) => {
    if (
      window.confirm(
        `Usunąć folder „${f.name}"? Jego zawartość przejdzie poziom wyżej (nic nie ginie).`,
      )
    ) {
      await deleteFolder(f.id)
    }
  }

  // -------------------------------------------------------------------------
  // Wiersze drzewa
  // -------------------------------------------------------------------------

  const conceptRow = (c: Concept, depth: number) => {
    const hint = dropHint?.id === c.id ? dropHint.pos : null
    return (
      <li key={c.id}>
        <button
          draggable
          className={`concept-item ${c.id === selectedId ? 'selected' : ''} ${
            hint === 'before' ? 'drop-before' : hint === 'after' ? 'drop-after' : ''
          }`}
          style={{ paddingLeft: 10 + depth * 16 }}
          onClick={() => onSelect(c.id)}
          onDragStart={(e) => setDragData(e, { kind: 'concept', id: c.id })}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
            setDropHint({ id: c.id, pos })
            setRootHint(false)
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const p = getDragData(e)
            const pos = dropHint?.id === c.id ? dropHint.pos : 'after'
            clearHints()
            if (p && pos !== 'into') dropOnConcept(p, c, pos)
          }}
        >
          <span className={`type-badge type-${c.type}`}>
            {BLOCK_TYPE_LABELS[c.type]}
          </span>
          <span className="concept-name">{c.name}</span>
          {c.tags.length > 0 && (
            <span className="concept-tags">{c.tags.map((t) => `#${t}`).join(' ')}</span>
          )}
        </button>
      </li>
    )
  }

  const folderRow = (f: Folder, depth: number) => {
    const isOpen = expanded.has(f.id)
    const hintInto = dropHint?.id === f.id && dropHint.pos === 'into'
    const count =
      childConcepts(f.id).length +
      folders.filter((x) => x.parentId === f.id).length
    return (
      <li key={f.id}>
        <div
          draggable
          className={`folder-row ${hintInto ? 'drop-into' : ''}`}
          style={{ paddingLeft: 6 + depth * 16 }}
          onClick={() => toggleExpanded(f.id)}
          onDragStart={(e) => setDragData(e, { kind: 'folder', id: f.id })}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDropHint({ id: f.id, pos: 'into' })
            setRootHint(false)
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const p = getDragData(e)
            clearHints()
            if (p) dropOnFolder(p, f.id)
          }}
        >
          <span className={`folder-chevron ${isOpen ? 'open' : ''}`}>▸</span>
          <span className="folder-name">{f.name}</span>
          <span className="folder-count">{count}</span>
          <span className="folder-actions">
            <button
              className="folder-action"
              title="Zmień nazwę"
              onClick={(e) => {
                e.stopPropagation()
                handleRenameFolder(f)
              }}
            >
              ✎
            </button>
            <button
              className="folder-action"
              title="Usuń folder (zawartość przejdzie wyżej)"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteFolder(f)
              }}
            >
              ×
            </button>
          </span>
        </div>
        {isOpen && (
          <ul className="folder-children">
            {childFolders(f.id).map((sub) => folderRow(sub, depth + 1))}
            {childConcepts(f.id).map((c) => conceptRow(c, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  // Widok płaski przy szukaniu / filtrze typu.
  const flatList = concepts
    .filter((c) => {
      if (typeFilter !== 'wszystkie' && c.type !== typeFilter) return false
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1 className="app-title">Kompendium</h1>
        <div className="sidebar-actions">
          <button className="btn btn-primary" onClick={handleNew}>
            + Nowy klocek
          </button>
          <button className="btn" title="Nowy folder" onClick={handleNewFolder}>
            + 🗀
          </button>
        </div>
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

      {filtering ? (
        <ul className="concept-list">
          {flatList.length === 0 && (
            <li className="concept-empty">Nic nie pasuje do filtra.</li>
          )}
          {flatList.map((c) => conceptRow(c, 0))}
        </ul>
      ) : (
        <ul
          className={`concept-list ${rootHint ? 'drop-root' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDropHint(null)
            setRootHint(true)
          }}
          onDragLeave={() => setRootHint(false)}
          onDrop={(e) => {
            e.preventDefault()
            const p = getDragData(e)
            clearHints()
            if (p) dropOnRoot(p)
          }}
        >
          {folders.length === 0 && concepts.length === 0 && (
            <li className="concept-empty">Brak klocków. Utwórz pierwszy!</li>
          )}
          {childFolders(null).map((f) => folderRow(f, 0))}
          {childConcepts(null).map((c) => conceptRow(c, 0))}
        </ul>
      )}
    </aside>
  )
}
