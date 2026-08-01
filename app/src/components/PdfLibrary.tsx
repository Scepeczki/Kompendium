import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createFolder,
  db,
  deleteFolder,
  deletePdf,
  movePdf,
  renameFolder,
  renamePdf,
} from '../db'
import type { Folder, PdfDoc } from '../types'

interface Props {
  currentId: string | null
  onOpen: (id: string) => void
  /** Wywoływane po usunięciu PDF-a (żeby zamknąć go, jeśli był otwarty). */
  onDeleted?: (id: string) => void
}

const MIME = 'text/x-kompendium-pdf'

/** Biblioteka PDF-ów: prosta, jednopoziomowa struktura folderów.
 *  PDF-y przeciąga się na foldery; upuszczenie poza folderem = poziom główny. */
export function PdfLibrary({ currentId, onOpen, onDeleted }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hintId, setHintId] = useState<string | null>(null)
  const [rootHint, setRootHint] = useState(false)

  const folders =
    useLiveQuery(() => db.folders.where('kind').equals('pdfs').toArray(), []) ?? []
  const pdfs = useLiveQuery(() => db.pdfs.orderBy('addedAt').toArray(), []) ?? []

  const sortedFolders = [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, 'pl'),
  )
  // Odporność: PDF wskazujący na nieistniejący (już usunięty gdzie indziej)
  // folder ląduje na poziomie głównym zamiast znikać z widoku.
  const folderIds = new Set(folders.map((f) => f.id))
  const effectiveFolder = (id: string | null) => (id && folderIds.has(id) ? id : null)
  const inFolder = (folderId: string | null) =>
    pdfs.filter((p) => effectiveFolder(p.folderId ?? null) === folderId)

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

  const handleRenamePdf = async (p: PdfDoc) => {
    const name = window.prompt('Nazwa PDF-a w bibliotece:', p.title)
    if (!name?.trim() || name.trim() === p.title) return
    await renamePdf(p.id, name.trim())
  }

  /** Usuwa PDF wraz z plikiem. Ostrzega, jeśli jakieś klocki mają w nim źródła —
   *  odnośniki do niego przestaną działać. */
  const handleDeletePdf = async (p: PdfDoc) => {
    const versions = await db.versions.toArray()
    const used = versions.filter((v) => v.sourceRefs.some((r) => r.pdfId === p.id)).length
    const warn = used
      ? `\n\nUWAGA: ${used} wersji klocków ma podpięte źródła z tego PDF-a — te odnośniki przestaną działać.`
      : ''
    if (
      !window.confirm(
        `Usunąć „${p.title}" z biblioteki? Plik zniknie z aplikacji na stałe.${warn}`,
      )
    )
      return
    await deletePdf(p.id)
    onDeleted?.(p.id)
  }

  const pdfRow = (p: PdfDoc) => (
    <div
      key={p.id}
      draggable
      className={`pdflib-item ${p.id === currentId ? 'selected' : ''}`}
      onClick={() => onOpen(p.id)}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME, p.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span className="pdflib-title">🕮 {p.title}</span>
      <span className="folder-actions">
        <button
          className="folder-action"
          title="Zmień nazwę"
          onClick={(e) => {
            e.stopPropagation()
            handleRenamePdf(p)
          }}
        >
          ✎
        </button>
        <button
          className="folder-action"
          title="Usuń PDF z biblioteki"
          onClick={(e) => {
            e.stopPropagation()
            handleDeletePdf(p)
          }}
        >
          ×
        </button>
      </span>
    </div>
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
          {expanded.has(f.id) && (
            <div className="folder-children">
              {inFolder(f.id).length === 0 && (
                <div className="folder-empty">pusty</div>
              )}
              {inFolder(f.id).map((p) => pdfRow(p))}
            </div>
          )}
        </div>
      ))}

      {inFolder(null).map((p) => pdfRow(p))}
    </div>
  )
}
