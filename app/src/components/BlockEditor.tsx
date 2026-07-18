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

interface Props {
  concept: Concept
  version: BlockVersion
  versions: BlockVersion[]
  onShowVersion: (versionId: string | null) => void
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
  onDeleted,
  selecting,
  onToggleSelecting,
  onJumpToSource,
}: Props) {
  const [view, setView] = useState<ViewMode>('podzial')
  const [draft, setDraft] = useState(version.content)
  const saveTimer = useRef<number | undefined>(undefined)

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
        <button
          className={`btn ${selecting ? 'btn-active' : ''}`}
          onClick={onToggleSelecting}
          disabled={!isCurrent}
          title="Zaznacz fragment PDF i podepnij go jako źródło"
        >
          📌 Podepnij źródło
        </button>
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

      {version.sourceRefs.length > 0 && (
        <div className="source-row">
          <span className="source-label">Źródła:</span>
          {version.sourceRefs.map((r) => (
            <span key={r.id} className="source-chip">
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
          ))}
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
