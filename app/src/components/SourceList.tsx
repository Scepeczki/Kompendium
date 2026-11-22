import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { renderRegion } from '../pdfDoc'
import {
  isPdfSource,
  type BlockSourceRef,
  type PdfSourceRef,
  type SourceRef,
} from '../types'
import { useBlockTypes } from '../blockTypes'

interface Props {
  refs: SourceRef[]
  /** Skok do źródła: wycinek PDF albo kafelek (klik w pozycję listy). */
  onJump?: (ref: SourceRef) => void
  /** Gdy podane — przy każdym źródle krzyżyk „odepnij". */
  onRemove?: (ref: SourceRef) => void
}

/** Podgląd wycinka strony PDF pokazywany po najechaniu. */
function PdfPreview({ refItem }: { refItem: PdfSourceRef }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    renderRegion(refItem.pdfId, refItem.page, refItem.rect).then((url) => {
      if (!alive) return
      if (url) setSrc(url)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [refItem])
  return (
    <div className="source-preview">
      {src ? (
        <img src={src} alt={`Fragment strony ${refItem.page}`} />
      ) : (
        <span className="source-preview-status">
          {failed
            ? 'Nie udało się wczytać fragmentu (czy PDF nadal jest w bibliotece?)'
            : 'Wczytuję…'}
        </span>
      )}
    </div>
  )
}

/** Podgląd treści kafelka będącego źródłem. */
function BlockPreview({ refItem }: { refItem: BlockSourceRef }) {
  const typy = useBlockTypes()
  const concept = useLiveQuery(
    () => db.concepts.get(refItem.conceptId),
    [refItem.conceptId],
  )
  const versions =
    useLiveQuery(
      () => db.versions.where('conceptId').equals(refItem.conceptId).toArray(),
      [refItem.conceptId],
    ) ?? []
  if (!concept) {
    return (
      <div className="source-preview">
        <span className="source-preview-status">Kafelek został usunięty.</span>
      </div>
    )
  }
  const v =
    versions.find((x) => x.id === refItem.versionId) ??
    versions.find((x) => x.id === concept.currentVersionId)
  return (
    <div className="source-preview source-preview-block">
      <span className="source-preview-head">
        <span className="type-mini" data-typ={concept.type} style={typy.style(concept.type)}>
          {typy.short(concept.type)}
        </span>
        {concept.name}
        {v?.label && <span className="source-list-group"> · {v.label}</span>}
      </span>
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(v?.content ?? '') }}
      />
    </div>
  )
}

/** Podpis źródła: sama nazwa, bez miniatury strony. */
export const opisZrodla = (
  r: SourceRef,
  pdfs: { id: string; title: string }[],
  concepts: { id: string; name: string }[],
) =>
  isPdfSource(r)
    ? `${pdfs.find((p) => p.id === r.pdfId)?.title ?? 'PDF (usunięty)'}, s. ${r.page}`
    : (concepts.find((c) => c.id === r.conceptId)?.name ?? 'kafelek (usunięty)')

/** Źródła pod treścią bloku: nazwy zawsze na wierzchu, podgląd fragmentu po
 *  najechaniu i skok do źródła po kliknięciu. Źródłem może być wycinek PDF
 *  albo inny kafelek — stąd genealogia wiedzy aż do strony w książce. */
export function SourceList({ refs, onJump, onRemove }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const pdfs = useLiveQuery(() => db.pdfs.toArray(), []) ?? []
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (refs.length === 0) return null

  /** Krótka zwłoka, żeby podgląd nie migał przy przejeżdżaniu myszą. */
  const enter = (id: string) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHover(id), 180)
  }
  const leave = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHover(null), 120)
  }

  return (
    <div className="source-list">
      <div className="source-list-items">
        {refs.map((r) => (
          <span
            key={r.id}
            className="source-list-item"
            onMouseEnter={() => enter(r.id)}
            onMouseLeave={leave}
          >
            <button
              className="source-jump"
              title={
                isPdfSource(r) ? 'Pokaż to miejsce w PDF' : 'Otwórz kafelek będący źródłem'
              }
              onClick={() => onJump?.(r)}
            >
              {opisZrodla(r, pdfs, concepts)}
              {r.group && <span className="source-list-group"> · {r.group}</span>}
            </button>
            {onRemove && (
              <button
                className="source-odepnij"
                title="Odepnij to źródło (sam PDF i kafelek zostają)"
                aria-label="Odepnij źródło"
                onClick={() => onRemove(r)}
              >
                ×
              </button>
            )}
            {hover === r.id &&
              (isPdfSource(r) ? <PdfPreview refItem={r} /> : <BlockPreview refItem={r} />)}
          </span>
        ))}
      </div>
    </div>
  )
}
