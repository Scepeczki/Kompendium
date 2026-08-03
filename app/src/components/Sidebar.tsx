import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createConcept,
  createFolder,
  createPath,
  db,
  deleteConcept,
  deleteFolder,
  deletePath,
  moveConcept,
  moveFolder,
  movePath,
  renameFolder,
  updateConcept,
  updatePath,
} from '../db'
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_SHORT,
  BLOCK_TYPES,
  type BlockType,
  type Concept,
  type Folder,
  type LearningPath,
} from '../types'
import { Icon } from './Icon'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
  graphActive: boolean
  onToggleGraph: () => void
  openPathId: string | null
  onOpenPath: (id: string) => void
  onOpenSettings: () => void
}

/** Ładunek przeciągania (klocek, folder albo ścieżka). */
type DragPayload = { kind: 'concept' | 'folder' | 'path'; id: string }

/** Element wspólnej listy dzieci folderu (foldery, klocki i ścieżki przeplatają się). */
type TreeNode =
  | { kind: 'folder'; id: string; order: number; folder: Folder }
  | { kind: 'concept'; id: string; order: number; concept: Concept }
  | { kind: 'path'; id: string; order: number; path: LearningPath }

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

export function Sidebar({
  selectedId,
  onSelect,
  graphActive,
  onToggleGraph,
  openPathId,
  onOpenPath,
  onOpenSettings,
}: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<BlockType | 'wszystkie'>('wszystkie')
  /** Szukanie i filtr chowają się pod ikonami — rozwijane na żądanie. */
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  // klik poza listą typów ją zamyka
  useEffect(() => {
    if (!filterOpen) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.sidebar-tool-wrap')) setFilterOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [filterOpen])

  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)
  const [dropHint, setDropHint] = useState<DropHint>(null)
  const [rootHint, setRootHint] = useState(false)

  /** Menu tworzenia wywołane prawym przyciskiem na pustym miejscu listy.
   *  `parentId` bierze się z tego, gdzie kliknięto: wnętrze folderu tworzy
   *  w tym folderze, puste tło listy — na poziomie głównym. */
  const [menu, setMenu] = useState<{
    x: number
    y: number
    parentId: string | null
  } | null>(null)

  // menu znika przy kliknięciu gdzie indziej, Escape i przewijaniu listy
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  /** Menu nie może wyjść poza okno — inaczej ostatnia pozycja bywa nieklikalna. */
  const menuRef = (el: HTMLDivElement | null) => {
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = Math.min(0, window.innerWidth - 6 - r.right)
    const dy = Math.min(0, window.innerHeight - 6 - r.bottom)
    if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`
  }

  /** Prawy przycisk na pustym miejscu listy (nie na klocku, folderze, ścieżce). */
  const openMenu = (e: React.MouseEvent) => {
    const el = e.target as Element
    if (el.closest('.concept-item, .folder-row')) return
    e.preventDefault()
    const inside = el.closest('.folder-children') as HTMLElement | null
    setMenu({ x: e.clientX, y: e.clientY, parentId: inside?.dataset.folder ?? null })
  }

  const folders =
    useLiveQuery(() => db.folders.where('kind').equals('concepts').toArray(), []) ?? []
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const paths = useLiveQuery(() => db.paths.toArray(), []) ?? []

  const filtering = search.trim() !== '' || typeFilter !== 'wszystkie'

  // Odporność na osierocone odwołania: jeśli folderId/parentId wskazuje na
  // folder, który już nie istnieje (np. zaszłość ze starszej wersji bazy),
  // element traktujemy jak leżący na poziomie głównym zamiast go tracić z oczu.
  const folderIds = new Set(folders.map((f) => f.id))
  const effectiveParent = (id: string | null) => (id && folderIds.has(id) ? id : null)

  /** Dzieci rodzica: foldery, klocki i ścieżki we wspólnej, ręcznej kolejności. */
  const children = (parentId: string | null): TreeNode[] => {
    const fs: TreeNode[] = folders
      .filter((f) => effectiveParent(f.parentId ?? null) === parentId)
      .map((f) => ({ kind: 'folder', id: f.id, order: f.order ?? 0, folder: f }))
    const cs: TreeNode[] = concepts
      .filter((c) => effectiveParent(c.folderId ?? null) === parentId)
      .map((c) => ({ kind: 'concept', id: c.id, order: c.order ?? 0, concept: c }))
    const ps: TreeNode[] = paths
      .filter((p) => effectiveParent(p.folderId ?? null) === parentId)
      .map((p) => ({ kind: 'path', id: p.id, order: p.order ?? 0, path: p }))
    return [...fs, ...cs, ...ps].sort((a, b) => a.order - b.order)
  }

  const persistExpanded = (next: Set<string>) => {
    localStorage.setItem(EXP_KEY, JSON.stringify([...next]))
    return next
  }

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return persistExpanded(next)
    })
  }

  /** Czy folder `candidateId` leży wewnątrz folderu `ancestorId` (dowolnie głęboko). */
  const isInside = (candidateId: string | null, ancestorId: string): boolean => {
    let cur = candidateId ? folders.find((f) => f.id === candidateId) : undefined
    while (cur) {
      if (cur.id === ancestorId || cur.parentId === ancestorId) return true
      cur = folders.find((f) => f.id === cur!.parentId)
    }
    return false
  }

  const clearHints = () => {
    setDropHint(null)
    setRootHint(false)
  }

  /** Przenosi ładunek do wnętrza folderu (na koniec). */
  const dropInto = async (payload: DragPayload, folderId: string) => {
    if (payload.kind === 'concept') {
      await moveConcept(payload.id, folderId)
    } else if (payload.kind === 'path') {
      await movePath(payload.id, folderId)
    } else {
      if (payload.id === folderId || isInside(folderId, payload.id)) return
      await moveFolder(payload.id, folderId)
    }
    setExpanded((prev) => persistExpanded(new Set(prev).add(folderId)))
  }

  /** Ustawia ładunek przed/po elemencie docelowym (wspólna kolejność). */
  const dropRelative = async (
    payload: DragPayload,
    target: TreeNode,
    parentId: string | null,
    pos: 'before' | 'after',
  ) => {
    if (payload.id === target.id) return
    if (payload.kind === 'folder') {
      // folder nie może wylądować we własnym wnętrzu
      if (parentId !== null && isInside(parentId, payload.id)) return
    }
    const siblings = children(parentId)
    const i = siblings.findIndex((n) => n.id === target.id)
    let order: number
    if (pos === 'before') {
      const prev = siblings[i - 1]
      order = prev ? (prev.order + target.order) / 2 : target.order - 1
    } else {
      const next = siblings[i + 1]
      order = next ? (next.order + target.order) / 2 : target.order + 1
    }
    if (payload.kind === 'concept') await moveConcept(payload.id, parentId, order)
    else if (payload.kind === 'path') await movePath(payload.id, parentId, order)
    else await moveFolder(payload.id, parentId, order)
  }

  const dropOnRoot = async (payload: DragPayload) => {
    if (payload.kind === 'concept') await moveConcept(payload.id, null)
    else if (payload.kind === 'path') await movePath(payload.id, null)
    else await moveFolder(payload.id, null)
  }

  /** Rozwija folder, żeby świeżo utworzona rzecz była od razu widoczna. */
  const revealFolder = (parentId: string | null) => {
    if (parentId) setExpanded((prev) => persistExpanded(new Set(prev).add(parentId)))
  }

  const handleNew = async (parentId: string | null = null) => {
    const id = await createConcept()
    if (parentId) await moveConcept(id, parentId)
    revealFolder(parentId)
    onSelect(id)
  }

  const handleNewFolder = async (parentId: string | null = null) => {
    const name = window.prompt('Nazwa folderu:')
    if (!name?.trim()) return
    await createFolder('concepts', name.trim(), parentId)
    revealFolder(parentId)
  }

  const handleNewPath = async (parentId: string | null = null) => {
    const name = window.prompt('Nazwa ścieżki (skryptu nauki):')
    if (!name?.trim()) return
    const id = await createPath(name.trim())
    if (parentId) await movePath(id, parentId)
    revealFolder(parentId)
    onOpenPath(id)
  }

  const handleRenamePath = async (p: LearningPath) => {
    const name = window.prompt('Nowa nazwa ścieżki:', p.name)
    if (!name?.trim()) return
    await updatePath(p.id, { name: name.trim() })
  }

  const handleDeletePath = async (p: LearningPath) => {
    if (
      window.confirm(
        `Usunąć ścieżkę „${p.name}"? Klocki zostają w bazie — znika tylko mapa.`,
      )
    ) {
      await deletePath(p.id)
    }
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

  const handleRenameConcept = async (c: Concept) => {
    const name = window.prompt('Nowa nazwa pojęcia:', c.name)
    if (!name?.trim()) return
    await updateConcept(c.id, { name: name.trim() })
  }

  const handleDeleteConcept = async (c: Concept) => {
    if (
      window.confirm(
        `Usunąć pojęcie „${c.name}" ze wszystkimi wersjami? Tego nie da się cofnąć.`,
      )
    ) {
      await deleteConcept(c.id)
    }
  }

  const conceptRow = (c: Concept, parentId: string | null, node: TreeNode) => {
    const hint = dropHint?.id === c.id ? dropHint.pos : null
    return (
      <li key={c.id}>
        <div
          draggable
          className={`concept-item ${c.id === selectedId ? 'selected' : ''} ${
            hint === 'before' ? 'drop-before' : hint === 'after' ? 'drop-after' : ''
          }`}
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
            const pos = dropHint?.id === c.id && dropHint.pos !== 'into' ? dropHint.pos : 'after'
            clearHints()
            if (p) dropRelative(p, node, parentId, pos)
          }}
        >
          <span
            className={`type-mini type-${c.type}`}
            title={BLOCK_TYPE_LABELS[c.type]}
          >
            {BLOCK_TYPE_SHORT[c.type]}
          </span>
          <span className="concept-name">{c.name}</span>
          <span className="folder-actions">
            <button
              className="folder-action"
              title="Zmień nazwę pojęcia"
              onClick={(e) => {
                e.stopPropagation()
                handleRenameConcept(c)
              }}
            >
              ✎
            </button>
            <button
              className="folder-action"
              title="Usuń pojęcie (ze wszystkimi wersjami)"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteConcept(c)
              }}
            >
              ×
            </button>
          </span>
        </div>
      </li>
    )
  }

  const folderRow = (f: Folder, parentId: string | null, node: TreeNode) => {
    const isOpen = expanded.has(f.id)
    const hint = dropHint?.id === f.id ? dropHint.pos : null
    const kids = children(f.id)
    return (
      <li key={f.id}>
        <div
          draggable
          className={`folder-row ${hint === 'into' ? 'drop-into' : ''} ${
            hint === 'before' ? 'drop-before' : hint === 'after' ? 'drop-after' : ''
          }`}
          onClick={() => toggleExpanded(f.id)}
          onDragStart={(e) => setDragData(e, { kind: 'folder', id: f.id })}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // strefy: górne 30% = przed, dolne 30% = po, środek = do środka
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const pos =
              y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'into'
            setDropHint({ id: f.id, pos })
            setRootHint(false)
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const p = getDragData(e)
            const pos = dropHint?.id === f.id ? dropHint.pos : 'into'
            clearHints()
            if (!p) return
            if (pos === 'into') dropInto(p, f.id)
            else dropRelative(p, node, parentId, pos)
          }}
        >
          <span className={`folder-chevron ${isOpen ? 'open' : ''}`}>
            <Icon name="rozwin" size={0.95} />
          </span>
          <span className="folder-name">{f.name}</span>
          <span className="folder-count">{kids.length}</span>
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
          <ul className="folder-children" data-folder={f.id}>
            {kids.length === 0 && <li className="folder-empty">pusty</li>}
            {kids.map((n) => renderNode(n, f.id))}
          </ul>
        )}
      </li>
    )
  }

  const pathRow = (p: LearningPath, parentId: string | null, node: TreeNode) => {
    const hint = dropHint?.id === p.id ? dropHint.pos : null
    return (
      <li key={p.id}>
        <div
          draggable
          className={`concept-item path-item ${p.id === openPathId ? 'selected' : ''} ${
            hint === 'before' ? 'drop-before' : hint === 'after' ? 'drop-after' : ''
          }`}
          onClick={() => onOpenPath(p.id)}
          onDragStart={(e) => setDragData(e, { kind: 'path', id: p.id })}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
            setDropHint({ id: p.id, pos })
            setRootHint(false)
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const pl = getDragData(e)
            const pos =
              dropHint?.id === p.id && dropHint.pos !== 'into' ? dropHint.pos : 'after'
            clearHints()
            if (pl) dropRelative(pl, node, parentId, pos)
          }}
        >
          <span className="type-mini type-path" title="Ścieżka nauki">
            <Icon name="sciezka" size={0.95} />
          </span>
          <span className="concept-name">{p.name}</span>
          <span className="folder-actions">
            <button
              className="folder-action"
              title="Zmień nazwę ścieżki"
              onClick={(e) => {
                e.stopPropagation()
                handleRenamePath(p)
              }}
            >
              ✎
            </button>
            <button
              className="folder-action"
              title="Usuń ścieżkę"
              onClick={(e) => {
                e.stopPropagation()
                handleDeletePath(p)
              }}
            >
              ×
            </button>
          </span>
        </div>
      </li>
    )
  }

  const renderNode = (n: TreeNode, parentId: string | null) =>
    n.kind === 'folder'
      ? folderRow(n.folder, parentId, n)
      : n.kind === 'path'
        ? pathRow(n.path, parentId, n)
        : conceptRow(n.concept, parentId, n)

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

  // Szukajka znajduje też ścieżki (po nazwie).
  const flatPaths =
    typeFilter !== 'wszystkie'
      ? []
      : paths.filter((p) => {
          const q = search.trim().toLowerCase()
          return q && p.name.toLowerCase().includes(q)
        })

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1 className="app-title">Kompendium</h1>
        <div className="sidebar-tools">
          <button
            className={`sidebar-tool ${searchOpen || search ? 'active' : ''}`}
            title="Szukaj po nazwie lub tagu"
            onClick={() => {
              if (searchOpen && !search) setSearchOpen(false)
              else if (searchOpen && search) {
                setSearch('')
                setSearchOpen(false)
              } else setSearchOpen(true)
            }}
          >
            <Icon name="szukaj" />
          </button>
          <div className="sidebar-tool-wrap">
            <button
              className={`sidebar-tool ${typeFilter !== 'wszystkie' ? 'active' : ''}`}
              title={
                typeFilter === 'wszystkie'
                  ? 'Pokaż tylko wybrany typ'
                  : `Pokazywane tylko: ${BLOCK_TYPE_LABELS[typeFilter]}`
              }
              onClick={() => setFilterOpen((o) => !o)}
            >
              <Icon name="filtr" />
              {typeFilter !== 'wszystkie' && (
                <span className="sidebar-tool-tag">{BLOCK_TYPE_SHORT[typeFilter]}</span>
              )}
            </button>
            {filterOpen && (
              <div className="sidebar-filter-pop">
                <button
                  className={`sidebar-filter-item ${typeFilter === 'wszystkie' ? 'active' : ''}`}
                  onClick={() => {
                    setTypeFilter('wszystkie')
                    setFilterOpen(false)
                  }}
                >
                  Wszystkie typy
                </button>
                {BLOCK_TYPES.map((t) => (
                  <button
                    key={t}
                    className={`sidebar-filter-item ${typeFilter === t ? 'active' : ''}`}
                    onClick={() => {
                      setTypeFilter(t)
                      setFilterOpen(false)
                    }}
                  >
                    <span className={`type-mini type-${t}`}>{BLOCK_TYPE_SHORT[t]}</span>
                    {BLOCK_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="sidebar-filters">
          <input
            className="input"
            type="search"
            autoFocus
            placeholder="Szukaj po nazwie lub tagu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearch('')
                setSearchOpen(false)
              }
            }}
          />
        </div>
      )}

      {/* tworzenie — tuż nad drzewem, bo dotyczy jego zawartości.
          Same znaczki; co robią, mówi dymek systemowy przy dłuższym najechaniu. */}
      <div className="sidebar-create">
        <button
          className="sidebar-create-btn"
          title="Nowy klocek"
          onClick={() => handleNew()}
        >
          <Icon name="klocek" />
        </button>
        <button
          className="sidebar-create-btn"
          title="Nowy folder"
          onClick={() => handleNewFolder()}
        >
          <Icon name="folder" />
        </button>
        <button
          className="sidebar-create-btn"
          title="Nowa ścieżka (materiał do nauki)"
          onClick={() => handleNewPath()}
        >
          <Icon name="sciezka" />
        </button>
      </div>

      {filtering ? (
        <ul className="concept-list" onContextMenu={openMenu}>
          {flatList.length === 0 && flatPaths.length === 0 && (
            <li className="concept-empty">Nic nie pasuje do filtra.</li>
          )}
          {flatList.map((c) =>
            conceptRow(c, c.folderId ?? null, {
              kind: 'concept',
              id: c.id,
              order: c.order ?? 0,
              concept: c,
            }),
          )}
          {flatPaths.map((p) =>
            pathRow(p, p.folderId ?? null, {
              kind: 'path',
              id: p.id,
              order: p.order ?? 0,
              path: p,
            }),
          )}
        </ul>
      ) : (
        <ul
          className={`concept-list ${rootHint ? 'drop-root' : ''}`}
          onContextMenu={openMenu}
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
          {children(null).map((n) => renderNode(n, null))}
        </ul>
      )}

      {/* prawy przycisk na pustym miejscu listy — tworzenie tam, gdzie kliknięto */}
      {menu && (
        <div
          ref={menuRef}
          className="tree-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="tree-menu-where">
            {menu.parentId
              ? `w folderze „${folders.find((f) => f.id === menu.parentId)?.name ?? ''}"`
              : 'na poziomie głównym'}
          </div>
          <button
            className="tree-menu-item"
            onClick={() => {
              setMenu(null)
              handleNew(menu.parentId)
            }}
          >
            <Icon name="klocek" size={1} />
            Nowy klocek
          </button>
          <button
            className="tree-menu-item"
            onClick={() => {
              setMenu(null)
              handleNewFolder(menu.parentId)
            }}
          >
            <Icon name="folder" size={1} />
            Nowy folder
          </button>
          <button
            className="tree-menu-item"
            onClick={() => {
              setMenu(null)
              handleNewPath(menu.parentId)
            }}
          >
            <Icon name="sciezka" size={1} />
            Nowa ścieżka
          </button>
        </div>
      )}
      {/* dół: rzeczy dotyczące całej aplikacji, nie zawartości drzewa */}
      <footer className="sidebar-footer">
        <button
          className={`sidebar-foot-btn ${graphActive ? 'active' : ''}`}
          title="Graf powiązań"
          onClick={onToggleGraph}
        >
          <Icon name="graf" />
          <span>Graf</span>
        </button>
        <span className="sidebar-counts" title="Liczba klocków i ścieżek">
          {concepts.length} · {paths.length}
        </span>
        <button
          className="sidebar-foot-btn"
          title="Ustawienia"
          onClick={onOpenSettings}
        >
          <Icon name="ustawienia" />
        </button>
      </footer>
    </aside>
  )
}
