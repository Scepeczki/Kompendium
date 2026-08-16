import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, importPdf } from '../db'
import { forgetPdf, loadPdf } from '../pdfDoc'
import { isPdfSource, type PdfSourceRef, type Rect } from '../types'
import { PdfLibrary } from './PdfLibrary'

/** Cel skoku do źródła (klik w odnośnik w edytorze). */
export interface PdfTarget {
  pdfId: string
  page: number
  rect: Rect
}

interface Props {
  /** Tryb podpinania źródła: po narysowaniu prostokąta wywołuje onRegionSelected. */
  selecting: boolean
  onRegionSelected: (ref: Omit<PdfSourceRef, 'id'>) => void
  target: PdfTarget | null
  onHide: () => void
  /** Otwarcie kafelka po kliknięciu w użyty fragment strony. */
  onOpenConcept?: (id: string) => void
}

interface DragState {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4

/** Widok PDF: wszystkie strony jedna pod drugą, przewijane jak w zwykłej
 *  przeglądarce dokumentów. Strony renderują się, gdy zbliżają się do okna. */
export function PdfPanel({
  selecting,
  onRegionSelected,
  target,
  onHide,
  onOpenConcept,
}: Props) {
  const pdfs = useLiveQuery(() => db.pdfs.orderBy('addedAt').toArray(), []) ?? []
  const [pdfId, setPdfId] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  /** Rozmiar strony przy skali 1 (z pierwszej strony — reszta zwykle taka sama). */
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null)
  /** 'fit' = dopasowanie do szerokości panelu, liczba = px CSS na punkt PDF. */
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [visiblePage, setVisiblePage] = useState(1)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [highlight, setHighlight] = useState<{ page: number; rect: Rect } | null>(null)
  /** Pokazywanie wszystkich już wykorzystanych fragmentów tego PDF-a. */
  const [showUsed, setShowUsed] = useState(
    () => localStorage.getItem('ui.pdfShowUsed') !== '0',
  )
  useEffect(() => {
    localStorage.setItem('ui.pdfShowUsed', showUsed ? '1' : '0')
  }, [showUsed])

  // Wszystkie źródła wskazujące na otwarty PDF — z nazwą kafelka, do etykiet.
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const versions = useLiveQuery(() => db.versions.toArray(), []) ?? []
  /** Fragmenty ze WSZYSTKICH wersji, nie tylko bieżących.
   *
   *  Dawniej pokazywaliśmy same bieżące — z obawy, że stare zaśmiecą stronę.
   *  Ale odkąd po starszych wersjach też się pisze i podpina im źródła, taki
   *  fragment po prostu znikał: nie było go widać ani wśród prostokątów, ani
   *  przy wpinaniu do innego kafelka.
   *
   *  Nowa wersja dostaje kopie źródeł poprzedniej, więc ten sam prostokąt
   *  siedziałby na stronie tyle razy, ile wersji ma kafelek — dlatego jeden
   *  kafelek pokazujemy w danym miejscu raz. */
  const usedRects = pdfId
    ? (() => {
        const widziane = new Set<string>()
        const lista: { ref: PdfSourceRef; conceptId: string; name: string }[] = []
        for (const v of versions) {
          const c = concepts.find((x) => x.id === v.conceptId)
          if (!c) continue
          for (const r of v.sourceRefs) {
            if (!isPdfSource(r) || r.pdfId !== pdfId) continue
            const klucz = `${c.id}|${r.page}|${Math.round(r.rect.x)}|${Math.round(
              r.rect.y,
            )}|${Math.round(r.rect.w)}|${Math.round(r.rect.h)}`
            if (widziane.has(klucz)) continue
            widziane.add(klucz)
            lista.push({ ref: r, conceptId: c.id, name: c.name })
          }
        }
        return lista
      })()
    : []

  /** Ten sam fragment bywa źródłem kilku kafelków — wtedy zamiast zgadywać,
   *  pokazujemy listę. „Ten sam" znaczy: prostokąty niemal się pokrywają. */
  const wSpolneRects = (u: (typeof usedRects)[number]) =>
    usedRects.filter(
      (x) =>
        x.ref.page === u.ref.page &&
        Math.abs(x.ref.rect.x - u.ref.rect.x) < 6 &&
        Math.abs(x.ref.rect.y - u.ref.rect.y) < 6 &&
        Math.abs(x.ref.rect.w - u.ref.rect.w) < 12 &&
        Math.abs(x.ref.rect.h - u.ref.rect.h) < 12,
    )
  const [wybor, setWybor] = useState<{
    x: number
    y: number
    lista: typeof usedRects
  } | null>(null)
  useEffect(() => {
    if (!wybor) return
    const zamknij = () => setWybor(null)
    document.addEventListener('mousedown', zamknij)
    return () => document.removeEventListener('mousedown', zamknij)
  }, [wybor])

  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>())
  /** Skala, w jakiej dana strona jest już narysowana (unika przerysowań). */
  const renderedAt = useRef(new Map<number, number>())

  // szerokość panelu — do dopasowania i przerysowania po przeciągnięciu krawędzi
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [doc])

  const fitScale =
    baseSize && containerW ? Math.max(0.1, (containerW - 34) / baseSize.w) : 1
  const scale = zoom === 'fit' ? fitScale : zoom

  // Otwórz dokument po wyborze PDF-a.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      renderedAt.current.clear()
      canvasRefs.current.clear()
      pageRefs.current.clear()
      if (!pdfId) {
        setDoc(null)
        setPageCount(0)
        setBaseSize(null)
        return
      }
      const loaded = await loadPdf(pdfId)
      if (!loaded || cancelled) return
      const first = await loaded.getPage(1)
      const vp = first.getViewport({ scale: 1 })
      if (cancelled) return
      setDoc(loaded)
      setPageCount(loaded.numPages)
      setBaseSize({ w: vp.width, h: vp.height })
      setVisiblePage(1)
      setHighlight(null)
    })()
    return () => {
      cancelled = true
    }
  }, [pdfId])

  // zmiana skali → wszystko do przerysowania
  useEffect(() => {
    renderedAt.current.clear()
  }, [scale])

  /** Rysuje stronę, o ile nie jest już narysowana w tej skali. */
  const renderPage = useCallback(
    async (num: number) => {
      if (!doc) return
      if (renderedAt.current.get(num) === scale) return
      const canvas = canvasRefs.current.get(num)
      if (!canvas) return
      renderedAt.current.set(num, scale)
      const p = await doc.getPage(num)
      const viewport = p.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const wrap = pageRefs.current.get(num)
      if (wrap) {
        wrap.style.width = `${Math.floor(viewport.width)}px`
        wrap.style.height = `${Math.floor(viewport.height)}px`
      }
      try {
        await p.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise
      } catch {
        renderedAt.current.delete(num) // np. przerwane przez kolejne renderowanie
      }
    },
    [doc, scale],
  )

  // Rysuj strony, które zbliżają się do okna; śledź, która jest widoczna.
  useEffect(() => {
    const root = scrollRef.current
    if (!doc || !root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const num = Number((e.target as HTMLElement).dataset.page)
          if (e.isIntersecting) void renderPage(num)
        }
        // bieżąca strona = najwyższa widoczna w oknie
        const visible = entries
          .filter((e) => e.intersectionRatio > 0)
          .map((e) => Number((e.target as HTMLElement).dataset.page))
        if (visible.length) {
          setVisiblePage((prev) => {
            const top = Math.min(...visible)
            return Number.isFinite(top) ? top : prev
          })
        }
      },
      { root, rootMargin: '600px 0px', threshold: 0 },
    )
    for (const el of pageRefs.current.values()) io.observe(el)
    return () => io.disconnect()
  }, [doc, pageCount, renderPage])

  // Skok do źródła: otwórz PDF, przewiń do strony i podświetl prostokąt.
  useEffect(() => {
    if (!target) return
    setPdfId(target.pdfId)
    setHighlight({ page: target.page, rect: target.rect })
  }, [target])

  useEffect(() => {
    if (!doc || !highlight) return
    const el = pageRefs.current.get(highlight.page)
    if (el) el.scrollIntoView({ block: 'center' })
  }, [doc, highlight])

  const goToPage = (n: number) => {
    const num = Math.min(Math.max(1, n), pageCount)
    pageRefs.current.get(num)?.scrollIntoView({ block: 'start' })
    setVisiblePage(num)
  }

  const changeZoom = (dir: 1 | -1) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale + dir * 0.2))
    setZoom(next)
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const id = await importPdf(file)
    setPdfId(id)
    setLibOpen(false)
  }

  /** Pozycja myszy względem canvasa danej strony, w px CSS. */
  const mousePos = (e: React.MouseEvent, num: number) => {
    const c = canvasRefs.current.get(num)!
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onMouseDown = (e: React.MouseEvent, num: number) => {
    if (!selecting || !doc) return
    const { x, y } = mousePos(e, num)
    setDrag({ page: num, x0: x, y0: y, x1: x, y1: y })
  }

  const onMouseMove = (e: React.MouseEvent, num: number) => {
    if (!drag || drag.page !== num) return
    const { x, y } = mousePos(e, num)
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
    const num = drag.page
    setDrag(null)
    if (w < 5 || h < 5) return // przypadkowe kliknięcie
    // Przelicz z px CSS na współrzędne strony przy skali 1 (docs/DATA-FORMAT.md).
    onRegionSelected({
      pdfId,
      page: num,
      rect: { x: x / scale, y: y / scale, w: w / scale, h: h / scale },
    })
  }

  const dragRect = drag && {
    left: Math.min(drag.x0, drag.x1),
    top: Math.min(drag.y0, drag.y1),
    width: Math.abs(drag.x1 - drag.x0),
    height: Math.abs(drag.y1 - drag.y0),
  }

  const placeholder = baseSize
    ? { width: Math.floor(baseSize.w * scale), height: Math.floor(baseSize.h * scale) }
    : undefined

  return (
    <section className="pdf-panel">
      <header className="pdf-toolbar">
        {pdfId && (
          <button
            className="btn"
            title="Wróć do biblioteki PDF-ów"
            onClick={() => {
              setPdfId(null)
              setLibOpen(true)
            }}
          >
            ←
          </button>
        )}
        <button
          className={`btn pdf-lib-toggle ${libOpen ? 'btn-active' : ''}`}
          title="Biblioteka PDF-ów"
          onClick={() => setLibOpen((o) => !o)}
        >
          {pdfs.find((p) => p.id === pdfId)?.title ?? 'Biblioteka'}
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
            <button className="btn" title="Pomniejsz" onClick={() => changeZoom(-1)}>
              −
            </button>
            <button
              className={`btn ${zoom === 'fit' ? 'btn-active' : ''}`}
              title="Dopasuj do szerokości panelu"
              onClick={() => setZoom('fit')}
            >
              {Math.round(scale * 100)}%
            </button>
            <button className="btn" title="Powiększ" onClick={() => changeZoom(1)}>
              +
            </button>
            <input
              className="input pdf-page-input"
              type="number"
              min={1}
              max={pageCount}
              value={visiblePage}
              title="Numer strony — wpisz, aby przeskoczyć"
              onChange={(e) => goToPage(Number(e.target.value))}
            />
            <span className="pdf-page-info">/ {pageCount}</span>
            <button
              className={`btn ${showUsed ? 'btn-active' : ''}`}
              title={`Pokaż fragmenty użyte w kafelkach (${usedRects.length})`}
              onClick={() => setShowUsed((s) => !s)}
            >
              ▣ {usedRects.length}
            </button>
          </div>
        )}
        <button className="btn btn-close" title="Schowaj panel PDF" onClick={onHide}>
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
          onDeleted={(id) => {
            forgetPdf(id)
            if (id === pdfId) setPdfId(null)
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

      <div className="pdf-scroll" ref={scrollRef}>
        {!doc && (
          <div className="pdf-empty">
            <p>Wrzuć książkę lub skrypt w PDF,</p>
            <p>żeby budować kafelki oparte na źródle.</p>
          </div>
        )}
        {doc &&
          Array.from({ length: pageCount }, (_, i) => i + 1).map((num) => (
            <div
              key={num}
              className={`pdf-page-wrap ${selecting ? 'selecting' : ''}`}
              data-page={num}
              style={placeholder}
              ref={(el) => {
                if (el) pageRefs.current.set(num, el)
                else pageRefs.current.delete(num)
              }}
              onMouseDown={(e) => onMouseDown(e, num)}
              onMouseMove={(e) => onMouseMove(e, num)}
              onMouseUp={onMouseUp}
              onMouseLeave={() => drag?.page === num && setDrag(null)}
            >
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(num, el)
                  else canvasRefs.current.delete(num)
                }}
              />
              <span className="pdf-page-number">{num}</span>
              {showUsed &&
                usedRects
                  .filter((u) => u.ref.page === num)
                  .map((u) => (
                    <button
                      key={u.ref.id}
                      className="pdf-used"
                      style={{
                        left: u.ref.rect.x * scale,
                        top: u.ref.rect.y * scale,
                        width: u.ref.rect.w * scale,
                        height: u.ref.rect.h * scale,
                      }}
                      title={
                        selecting
                          ? `Wepnij ten sam fragment jako źródło (użyty w: ${u.name})`
                          : `Użyte w: ${u.name}${onOpenConcept ? ' — kliknij, aby otworzyć' : ''}`
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        // W trybie podpinania klik w gotowy prostokąt wpina go
                        // tam, gdzie właśnie pracujemy — po co obrysowywać
                        // drugi raz to samo miejsce.
                        if (selecting) {
                          onRegionSelected({
                            pdfId: pdfId!,
                            page: u.ref.page,
                            rect: { ...u.ref.rect },
                          })
                          return
                        }
                        // Poza tym trybem klik prowadzi do kafelka. Jeśli ten
                        // sam fragment ma kilku właścicieli — najpierw pytamy,
                        // do którego.
                        const tuz = wSpolneRects(u)
                        if (tuz.length > 1) {
                          setWybor({ x: e.clientX, y: e.clientY, lista: tuz })
                          return
                        }
                        onOpenConcept?.(u.conceptId)
                      }}
                    >
                      <span className="pdf-used-label">{u.name}</span>
                    </button>
                  ))}
              {highlight?.page === num && (
                <div
                  className="pdf-highlight"
                  style={{
                    left: highlight.rect.x * scale,
                    top: highlight.rect.y * scale,
                    width: highlight.rect.w * scale,
                    height: highlight.rect.h * scale,
                  }}
                />
              )}
              {dragRect && drag?.page === num && (
                <div className="pdf-dragbox" style={dragRect} />
              )}
            </div>
          ))}
      </div>

      {/* jeden fragment, kilku właścicieli — do którego skoczyć */}
      {wybor && (
        <div
          className="tree-menu"
          style={{ left: wybor.x, top: wybor.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="tree-menu-where">Ten fragment jest źródłem w:</div>
          {wybor.lista.map((u) => (
            <button
              key={u.ref.id}
              className="tree-menu-item"
              onClick={() => {
                setWybor(null)
                onOpenConcept?.(u.conceptId)
              }}
            >
              {u.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
