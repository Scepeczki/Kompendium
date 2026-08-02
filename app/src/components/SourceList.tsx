import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderRegion } from '../pdfDoc'
import type { SourceRef } from '../types'

interface Props {
  refs: SourceRef[]
  /** Skok do miejsca w PDF (klik w źródło). */
  onJump?: (ref: SourceRef) => void
}

/** Podgląd wycinka strony pokazywany po najechaniu na źródło. */
function Preview({ refItem }: { refItem: SourceRef }) {
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
          {failed ? 'Nie udało się wczytać fragmentu (czy PDF nadal jest w bibliotece?)' : 'Wczytuję…'}
        </span>
      )}
    </div>
  )
}

/** Lista źródeł pod treścią bloku: zwijana, z podglądem fragmentu PDF
 *  po najechaniu i skokiem do miejsca po kliknięciu. */
export function SourceList({ refs, onJump }: Props) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const pdfs = useLiveQuery(() => db.pdfs.toArray(), []) ?? []

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (refs.length === 0) return null
  const titleOf = (id: string) => pdfs.find((p) => p.id === id)?.title ?? 'PDF (usunięty)'

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
      <button
        className="source-list-toggle"
        title="Miejsca w PDF-ach, na których oparty jest ten klocek"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="source-list-label">Źródła</span>
        <span className="source-list-count">{refs.length}</span>
        <span className="source-list-sign">{open ? '−' : '+'}</span>
      </button>
      {open && (
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
                title="Pokaż to miejsce w PDF"
                onClick={() => onJump?.(r)}
              >
                📖 {titleOf(r.pdfId)} · s. {r.page}
                {r.group && <span className="source-list-group"> · {r.group}</span>}
              </button>
              {hover === r.id && <Preview refItem={r} />}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
