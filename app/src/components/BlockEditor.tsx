import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  deleteConcept,
  saveAsNewVersion,
  updateConcept,
  updateVersion,
} from '../db'
import { renderMarkdown } from '../markdown'
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  type BlockType,
  type BlockVersion,
  type Concept,
  type SourceRef,
} from '../types'

type ViewMode = 'kod' | 'podzial' | 'podglad'

/** Typ przeciągania chipów źródeł między grupami. */
const SRC_MIME = 'text/x-kompendium-src'

interface Props {
  concept: Concept
  version: BlockVersion
  versions: BlockVersion[]
  onShowVersion: (versionId: string | null) => void
  onClose: () => void
  onDeleted: () => void
  selecting: boolean
  onToggleSelecting: () => void
  onJumpToSource: (ref: SourceRef) => void
}

export function BlockEditor({
  concept,
  version,
  versions,
  onShowVersion,
  onClose,
  onDeleted,
  selecting,
  onToggleSelecting,
  onJumpToSource,
}: Props) {
  const [view, setView] = useState<ViewMode>('podzial')
  const [draft, setDraft] = useState(version.content)
  const saveTimer = useRef<number | undefined>(undefined)
  /** Zwinięte grupy źródeł (stan lokalny widoku). */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  /** Cel przeciągania chipa: nazwa grupy albo '' (obszar „bez grupy"). */
  const [srcHint, setSrcHint] = useState<string | null>(null)

  const isCurrent = version.id === concept.currentVersionId
  const pdfs = useLiveQuery(() => db.pdfs.toArray(), []) ?? []
  const pdfTitle = (id: string) => pdfs.find((p) => p.id === id)?.title ?? 'PDF'

  // Zmiana pokazywanej wersji → załaduj jej treść do edytora.
  useEffect(() => {
    setDraft(version.content)
  }, [version.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autozapis z opóźnieniem (tylko bieżąca wersja — stare są niezmienne).
  const onChange = (val: string) => {
    setDraft(val)
    if (!isCurrent) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      updateVersion(version.id, { content: val })
    }, 400)
  }

  const preview = useMemo(() => renderMarkdown(draft), [draft])

  const handleNewVersion = async () => {
    const label = window.prompt(
      'Etykieta nowej wersji (np. „wg Rudina") — można zostawić puste:',
    )
    if (label === null) return
    const id = await saveAsNewVersion(concept.id, label.trim() || undefined)
    onShowVersion(id)
  }

  const handleDelete = async () => {
    if (
      window.confirm(
        `Usunąć pojęcie „${concept.name}" ze wszystkimi wersjami? Tego nie da się cofnąć.`,
      )
    ) {
      await deleteConcept(concept.id)
      onDeleted()
    }
  }

  const removeSourceRef = async (refId: string) => {
    if (!isCurrent) return
    await updateVersion(version.id, {
      sourceRefs: version.sourceRefs.filter((r) => r.id !== refId),
    })
  }

  /** Nazwy grup: jawnie utworzone + te wynikające z przypisań (stare dane). */
  const groupNames = [
    ...new Set([
      ...(version.sourceGroups ?? []),
      ...version.sourceRefs.map((r) => r.group).filter((g): g is string => !!g),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'pl'))

  const refsIn = (group: string | null) =>
    version.sourceRefs.filter((r) => (r.group ?? null) === group)

  /** Przenosi chip źródła do grupy (undefined = bez grupy). */
  const setRefGroup = async (refId: string, group: string | undefined) => {
    if (!isCurrent) return
    await updateVersion(version.id, {
      sourceRefs: version.sourceRefs.map((r) =>
        r.id === refId ? { ...r, group } : r,
      ),
    })
  }

  const handleNewGroup = async () => {
    const name = window.prompt('Nazwa nowej grupy źródeł:')
    if (!name?.trim()) return
    const n = name.trim()
    if (groupNames.includes(n)) return
    await updateVersion(version.id, { sourceGroups: [...groupNames, n] })
  }

  const handleRenameGroup = async (group: string) => {
    const name = window.prompt('Nowa nazwa grupy:', group)
    if (!name?.trim() || name.trim() === group) return
    const n = name.trim()
    await updateVersion(version.id, {
      sourceGroups: groupNames.map((g) => (g === group ? n : g)),
      sourceRefs: version.sourceRefs.map((r) =>
        r.group === group ? { ...r, group: n } : r,
      ),
    })
  }

  const handleDeleteGroup = async (group: string) => {
    if (
      !window.confirm(
        `Usunąć grupę „${group}"? Źródła z niej wrócą do listy bez grupy.`,
      )
    )
      return
    await updateVersion(version.id, {
      sourceGroups: groupNames.filter((g) => g !== group),
      sourceRefs: version.sourceRefs.map((r) =>
        r.group === group ? { ...r, group: undefined } : r,
      ),
    })
  }

  const toggleGroup = (group: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

  /** Chip źródła — przeciągalny między grupami. */
  const sourceChip = (r: SourceRef) => (
    <span
      key={r.id}
      className="source-chip"
      draggable={isCurrent}
      onDragStart={(e) => {
        e.dataTransfer.setData(SRC_MIME, r.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <button
        className="source-jump"
        title="Skocz do miejsca w PDF"
        onClick={() => onJumpToSource(r)}
      >
        📖 {pdfTitle(r.pdfId)} · s. {r.page}
      </button>
      {isCurrent && (
        <button
          className="source-remove"
          title="Odepnij źródło"
          onClick={() => removeSourceRef(r.id)}
        >
          ×
        </button>
      )}
    </span>
  )

  const setTags = (raw: string) => {
    const tags = raw
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
    updateConcept(concept.id, { tags })
  }

  const sorted = [...versions].sort((a, b) => a.version - b.version)

  return (
    <section className="editor">
      <header className="editor-header">
        <div className="editor-title-row">
          <select
            className={`input type-select type-${concept.type}`}
            value={concept.type}
            onChange={(e) =>
              updateConcept(concept.id, { type: e.target.value as BlockType })
            }
          >
            {BLOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {BLOCK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            className="input editor-name"
            value={concept.name}
            onChange={(e) => updateConcept(concept.id, { name: e.target.value })}
            placeholder="Nazwa pojęcia…"
          />
          <button className="btn btn-danger" title="Usuń pojęcie" onClick={handleDelete}>
            Usuń
          </button>
          <button
            className="btn btn-close"
            title="Zamknij klocek (wróć do widoku startowego)"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="editor-meta-row">
          <input
            className="input editor-tags"
            defaultValue={concept.tags.join(', ')}
            key={concept.id}
            onBlur={(e) => setTags(e.target.value)}
            placeholder="tagi, po, przecinku…"
          />
          <div className="version-bar">
            {sorted.map((v) => (
              <button
                key={v.id}
                className={`version-pill ${v.id === version.id ? 'active' : ''}`}
                title={v.label ?? `wersja ${v.version}`}
                onClick={() =>
                  onShowVersion(v.id === concept.currentVersionId ? null : v.id)
                }
              >
                v{v.version}
                {v.label ? ` · ${v.label}` : ''}
              </button>
            ))}
            <button className="version-pill new" onClick={handleNewVersion}>
              + nowa wersja
            </button>
          </div>
        </div>
      </header>

      {!isCurrent && (
        <div className="editor-banner">
          Przeglądasz starszą wersję v{version.version} — tylko do odczytu.
          Edycja odbywa się w wersji bieżącej.
        </div>
      )}

      <div className="editor-toolbar">
        <div className="toolbar-left">
          <button
            className={`btn ${selecting ? 'btn-active' : ''}`}
            onClick={onToggleSelecting}
            disabled={!isCurrent}
            title="Zaznacz fragment PDF i podepnij go jako źródło"
          >
            📌 Podepnij źródło
          </button>
          <button
            className="btn"
            onClick={handleNewGroup}
            disabled={!isCurrent}
            title="Nowa grupa źródeł"
          >
            + 🗀
          </button>
        </div>
        <div className="view-switch">
          {(['kod', 'podzial', 'podglad'] as ViewMode[]).map((m) => (
            <button
              key={m}
              className={`btn ${view === m ? 'btn-active' : ''}`}
              onClick={() => setView(m)}
            >
              {m === 'kod' ? 'Kod' : m === 'podzial' ? 'Podział' : 'Podgląd'}
            </button>
          ))}
        </div>
      </div>

      {(version.sourceRefs.length > 0 || groupNames.length > 0) && (
        <div
          className={`source-row ${srcHint === '' ? 'drop-root' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(SRC_MIME)) return
            e.preventDefault()
            setSrcHint('')
          }}
          onDragLeave={() => setSrcHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            const id = e.dataTransfer.getData(SRC_MIME)
            setSrcHint(null)
            if (id) setRefGroup(id, undefined)
          }}
        >
          <span className="source-label">Źródła:</span>
          {refsIn(null).map((r) => sourceChip(r))}
          {groupNames.map((g) => {
            const open = !collapsedGroups.has(g)
            return (
              <span key={g} className="source-group">
                <button
                  className={`source-group-head ${srcHint === g ? 'drop-into' : ''}`}
                  title={open ? 'Zwiń grupę' : 'Rozwiń grupę'}
                  onClick={() => toggleGroup(g)}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(SRC_MIME)) return
                    e.preventDefault()
                    e.stopPropagation()
                    setSrcHint(g)
                  }}
                  onDragLeave={() => setSrcHint(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const id = e.dataTransfer.getData(SRC_MIME)
                    setSrcHint(null)
                    if (id) setRefGroup(id, g)
                  }}
                >
                  <span className={`folder-chevron ${open ? 'open' : ''}`}>▸</span>
                  🗀 {g}
                  <span className="folder-count">{refsIn(g).length}</span>
                </button>
                {isCurrent && (
                  <span className="source-group-actions">
                    <button
                      className="folder-action"
                      title="Zmień nazwę grupy"
                      onClick={() => handleRenameGroup(g)}
                    >
                      ✎
                    </button>
                    <button
                      className="folder-action"
                      title="Usuń grupę (źródła wrócą do listy)"
                      onClick={() => handleDeleteGroup(g)}
                    >
                      ×
                    </button>
                  </span>
                )}
                {open && refsIn(g).map((r) => sourceChip(r))}
              </span>
            )
          })}
        </div>
      )}

      <div className={`editor-body view-${view}`}>
        {view !== 'podglad' && (
          <div className="editor-code">
            <CodeMirror
              value={draft}
              onChange={onChange}
              extensions={[markdown()]}
              editable={isCurrent}
              placeholder={'Treść klocka…\n\nMarkdown + LaTeX: $x^2$, $$\\int_a^b f\\,dx$$'}
              basicSetup={{ lineNumbers: false, foldGutter: false }}
              style={{ height: '100%' }}
            />
          </div>
        )}
        {view !== 'kod' && (
          <div
            className="editor-preview markdown-body"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
      </div>
    </section>
  )
}
