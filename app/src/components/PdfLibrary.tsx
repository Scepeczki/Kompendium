import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createFolder, db, deleteFolder, movePdf, renameFolder } from '../db'
import type { Folder, PdfDoc } from '../types'

interface Props {
  currentId: string | null
  onOpen: (id: string) => void
}

const MIME = 'text/x-kompendium-pdf'

/** Biblioteka PDF-ów: prosta, jednopoziomowa struktura folderów.
 *  PDF-y przeciąga się na foldery; upuszczenie poza folderem = poziom główny. */
export function PdfLibrary({ currentId, onOpen }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hintId, setHintId] = useState<string | null>(null)
  const [rootHint, setRootHint] = useState(false)

  const folders =
    useLiveQuery(() => db.folders.where('kind').equals('pdfs').toArray(), []) ?? []
  const pdfs = useLiveQuery(() => db.pdfs.orderBy('addedAt').toArray(), []) ?? []

  const sortedFolders = [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, 'pl'),
  )
  const inFolder = (folderId: string | null) =>
    pdfs.filter((p) => (p.folderId ?? null) === folderId)

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleNewFolder = async () => {
    const name = window.prompt('Nazwa folderu:')
    if (!name?.trim()) return
    await createFolder('pdfs', name.trim())
  }

  const handleRename = async (f: Folder) => {
    const name = window.prompt('Nowa nazwa folderu:', f.name)
    if (!name?.trim()) return
    await renameFolder(f.id, name.trim())
  }

  const handleDelete = async (f: Folder) => {
    if (
      window.confirm(
        `Usunąć folder „${f.name}"? PDF-y z niego wrócą na poziom główny.`,
      )
    ) {
      await deleteFolder(f.id)
    }
  }

  const pdfRow = (p: PdfDoc, indent: boolean) => (
    <button
      key={p.id}
      draggable
      className={`pdflib-item ${p.id === currentId ? 'selected' : ''}`}
      style={indent ? { paddingLeft: 30 } : undefined}
      onClick={() => onOpen(p.id)}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME, p.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      🕮 {p.title}
    </button>
  )

  return (
    <div
      className={`pdf-library ${rootHint ? 'drop-root' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setHintId(null)
        setRootHint(true)
      }}
      onDragLeave={() => setRootHint(false)}
      onDrop={(e) => {
        e.preventDefault()
        setRootHint(false)
        const id = e.dataTransfer.getData(MIME)
        if (id) movePdf(id, null)
      }}
    >
      <div className="pdflib-header">
        <span className="source-label">Biblioteka</span>
        <button className="btn" title="Nowy folder" onClick={handleNewFolder}>
          + 🗀
        </button>
      </div>

      {sortedFolders.length === 0 && pdfs.length === 0 && (
        <p className="pdflib-empty">Brak PDF-ów — wrzuć pierwszy przyciskiem powyżej.</p>
      )}

      {sortedFolders.map((f) => (
        <div key={f.id}>
          <div
            className={`folder-row ${hintId === f.id ? 'drop-into' : ''}`}
            onClick={() => toggle(f.id)}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setHintId(f.id)
              setRootHint(false)
            }}
            onDragLeave={() => setHintId(null)}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setHintId(null)
              const id = e.dataTransfer.getData(MIME)
              if (id) {
                movePdf(id, f.id)
                setExpanded((prev) => new Set(prev).add(f.id))
              }
            }}
          >
            <span className={`folder-chevron ${expanded.has(f.id) ? 'open' : ''}`}>
              ▸
            </span>
            <span className="folder-name">{f.name}</span>
            <span className="folder-count">{inFolder(f.id).length}</span>
            <span className="folder-actions">
              <button
                className="folder-action"
                title="Zmień nazwę"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRename(f)
                }}
              >
                ✎
              </button>
              <button
                className="folder-action"
                title="Usuń folder (PDF-y wrócą na poziom główny)"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(f)
                }}
              >
                ×
              </button>
            </span>
          </div>
          {expanded.has(f.id) && inFolder(f.id).map((p) => pdfRow(p, true))}
        </div>
      ))}

      {inFolder(null).map((p) => pdfRow(p, false))}
    </div>
  )
}
