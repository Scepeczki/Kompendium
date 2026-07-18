import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, importPdf } from '../db'
import type { Rect, SourceRef } from '../types'
import { PdfLibrary } from './PdfLibrary'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Cel skoku do źródła (klik w odnośnik w edytorze). */
export interface PdfTarget {
  pdfId: string
  page: number
  rect: Rect
}

interface Props {
  /** Tryb podpinania źródła: po narysowaniu prostokąta wywołuje onRegionSelected. */
  selecting: boolean
  onRegionSelected: (ref: Omit<SourceRef, 'id'>) => void
  target: PdfTarget | null
  onHide: () => void
}

interface DragState {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function PdfPanel({ selecting, onRegionSelected, target, onHide }: Props) {
  const pdfs = useLiveQuery(() => db.pdfs.orderBy('addedAt').toArray(), []) ?? []
  const [pdfId, setPdfId] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  /** Skala renderowania: px CSS na 1 punkt PDF. */
  const [scale, setScale] = useState(1)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [highlight, setHighlight] = useState<Rect | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Szerokość panelu (obserwowana), żeby strona przerysowała się po
  // przeciągnięciu krawędzi panelu.
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Otwórz dokument po wyborze PDF-a.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!pdfId) {
        setDoc(null)
        setPageCount(0)
        return
      }
      const rec = await db.pdfs.get(pdfId)
      if (!rec || cancelled) return
      const data = await rec.data.arrayBuffer()
      const loaded = await pdfjsLib.getDocument({ data }).promise
      if (cancelled) return
      setDoc(loaded)
      setPageCount(loaded.numPages)
      setPage(1)
      setHighlight(null)
    })()
    return () => {
      cancelled = true
    }
  }, [pdfId])

  // Skok do źródła: otwórz właściwy PDF, stronę i podświetl prostokąt.
  useEffect(() => {
    if (!target) return
    setPdfId(target.pdfId)
    setPage(target.page)
    setHighlight(target.rect)
  }, [target])

  // Renderuj bieżącą stronę do canvasa (dopasowanie do szerokości panelu).
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    ;(async () => {
      const p = await doc.getPage(page)
      if (cancelled) return
      const containerWidth = containerW || (containerRef.current?.clientWidth ?? 600)
      const base = p.getViewport({ scale: 1 })
      const s = Math.max(0.1, (containerWidth - 24) / base.width)
      const viewport = p.getViewport({ scale: s })
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      await p.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise
      if (!cancelled) setScale(s)
    })()
    return () => {
      cancelled = true
    }
  }, [doc, page, containerW])

  const goToPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), pageCount))
    setHighlight(null)
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const id = await importPdf(file)
    setPdfId(id)
  }

  /** Pozycja myszy względem canvasa, w px CSS. */
  const mousePos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (!selecting || !doc) return
    const { x, y } = mousePos(e)
    setDrag({ x0: x, y0: y, x1: x, y1: y })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return
    const { x, y } = mousePos(e)
    setDrag({ ...drag, x1: x, y1: y })
  }

  const onMouseUp = () => {
    if (!drag || !pdfId) {
      setDrag(null)
      return
    }
    const x = Math.min(drag.x0, drag.x1)
    const y = Math.min(drag.y0, drag.y1)
    const w = Math.abs(drag.x1 - drag.x0)
    const h = Math.abs(drag.y1 - drag.y0)
    setDrag(null)
    if (w < 5 || h < 5) return // przypadkowe kliknięcie
    // Przelicz z px CSS na współrzędne strony przy skali 1 (docs/DATA-FORMAT.md).
    onRegionSelected({
      pdfId,
      page,
      rect: { x: x / scale, y: y / scale, w: w / scale, h: h / scale },
    })
  }

  const dragRect = drag && {
    left: Math.min(drag.x0, drag.x1),
    top: Math.min(drag.y0, drag.y1),
    width: Math.abs(drag.x1 - drag.x0),
    height: Math.abs(drag.y1 - drag.y0),
  }

  return (
    <section className="pdf-panel">
      <header className="pdf-toolbar">
        <button
          className={`btn pdf-lib-toggle ${libOpen ? 'btn-active' : ''}`}
          title="Biblioteka PDF-ów"
          onClick={() => setLibOpen((o) => !o)}
        >
          🕮 {pdfs.find((p) => p.id === pdfId)?.title ?? 'Biblioteka'}
        </button>
        <button className="btn" onClick={() => fileInputRef.current?.click()}>
          + Wrzuć PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => handleImport(e.target.files?.[0])}
        />
        {doc && (
          <div className="pdf-nav">
            <button className="btn" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
              ‹
            </button>
            <span className="pdf-page-info">
              {page} / {pageCount}
            </span>
            <button
              className="btn"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount}
            >
              ›
            </button>
          </div>
        )}
        <button
          className="btn btn-close"
          title="Schowaj panel PDF"
          onClick={onHide}
        >
          ✕
        </button>
      </header>

      {libOpen && (
        <PdfLibrary
          currentId={pdfId}
          onOpen={(id) => {
            setPdfId(id)
            setLibOpen(false)
          }}
        />
      )}

      {selecting && (
        <div className="pdf-banner">
          {doc
            ? '✂ Zaznacz prostokątem fragment strony, który jest źródłem.'
            : 'Najpierw otwórz PDF, żeby podpiąć źródło.'}
        </div>
      )}

      <div className="pdf-scroll" ref={containerRef}>
        {!doc && (
          <div className="pdf-empty">
            <p>Wrzuć książkę lub skrypt w PDF,</p>
            <p>żeby budować klocki oparte na źródle.</p>
          </div>
        )}
        {doc && (
          <div
            className={`pdf-page-wrap ${selecting ? 'selecting' : ''}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => setDrag(null)}
          >
            <canvas ref={canvasRef} />
            {highlight && (
              <div
                className="pdf-highlight"
                style={{
                  left: highlight.x * scale,
                  top: highlight.y * scale,
                  width: highlight.w * scale,
                  height: highlight.h * scale,
                }}
              />
            )}
            {dragRect && <div className="pdf-dragbox" style={dragRect} />}
          </div>
        )}
      </div>
    </section>
  )
}
