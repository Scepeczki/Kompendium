import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  PAGE_WIDTH_DEFAULT,
  getPageWidth,
  setPageWidth,
} from '../uiSettings'
import {
  INDENT_MAX,
  NO_INDENTS,
  applyIndents,
  readIndents,
  type Indents,
} from '../indent'

/** Wewnętrzny margines kolumny tekstu — musi zgadzać się z CSS
 *  (padding-inline w .rich-content .tiptap). */
const PAD = 6

/** Linijka nad edytorem (jak w Google Docs).
 *  Zielone trójkąciki = szerokość tekstu (globalna, ta sama co w Ustawieniach);
 *  celują dokładnie w początek/koniec tekstu. Kreseczki pokazują szerokość
 *  domyślną, dwuklik trójkąta ją przywraca.
 *  Niebieskie znaczniki = wcięcia LOKALNE (akapity objęte zaznaczeniem):
 *  prostokącik — początek pierwszej linii, trójkącik w górę z lewej — początek
 *  reszty tekstu, trójkącik z prawej — koniec tekstu. Dwuklik zeruje. */
export function PageRuler({ editor }: { editor?: Editor | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [pw, setPw] = useState(getPageWidth)
  const [dragging, setDragging] = useState(false)
  const [ind, setInd] = useState<Indents>(NO_INDENTS)
  // świeże wcięcia dla domknięć przeciągania (stan bywa o render do tyłu)
  const indRef = useRef(ind)
  indRef.current = ind

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const h = () => setPw(getPageWidth())
    window.addEventListener('komp:ui', h)
    return () => window.removeEventListener('komp:ui', h)
  }, [])

  // wcięcia akapitu pod kursorem — odświeżane przy każdej zmianie w edytorze
  useEffect(() => {
    if (!editor) return
    const h = () => setInd(readIndents(editor))
    editor.on('transaction', h)
    h()
    return () => {
      editor.off('transaction', h)
    }
  }, [editor])

  const cx = w / 2
  const half = Math.min(pw, w) / 2
  // krawędzie właściwego tekstu (kolumna minus margines wewnętrzny)
  const textL = cx - half + PAD
  const textR = cx + half - PAD
  const defHalf = Math.min(PAGE_WIDTH_DEFAULT, w) / 2
  const clampX = (x: number) => Math.min(w - 5, Math.max(5, x))
  const snap = (v: number) => Math.round(v / 5) * 5

  /** Wspólny szkielet przeciągania: onMove dostaje x względem linijki. */
  const drag =
    (onMove: (x: number) => void, withLabel = false) =>
    (e: React.PointerEvent) => {
      e.preventDefault()
      const el = ref.current
      if (!el) return
      if (withLabel) setDragging(true)
      const move = (ev: PointerEvent) => {
        onMove(ev.clientX - el.getBoundingClientRect().left)
      }
      const up = () => {
        setDragging(false)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  const dragWidth = drag((x) => {
    // trójkącik stoi na krawędzi tekstu — szerokość kolumny to tekst + marginesy
    setPageWidth(Math.round((2 * (Math.abs(x - cx) + PAD)) / 10) * 10)
  }, true)

  const clampInd = (v: number, lo = 0) =>
    Math.min(INDENT_MAX, Math.max(lo, snap(v)))

  const dragLeft = drag((x) => {
    if (!editor) return
    const cur = indRef.current
    const left = clampInd(x - textL)
    if (left !== cur.left) applyIndents(editor, { ...cur, left })
  })
  const dragFirst = drag((x) => {
    if (!editor) return
    const cur = indRef.current
    const first = clampInd(x - textL - cur.left, -cur.left)
    if (first !== cur.first) applyIndents(editor, { ...cur, first })
  })
  const dragRight = drag((x) => {
    if (!editor) return
    const cur = indRef.current
    const right = clampInd(textR - x)
    if (right !== cur.right) applyIndents(editor, { ...cur, right })
  })

  const resetWidth = () => setPageWidth(PAGE_WIDTH_DEFAULT)

  const widthTitle = `Szerokość tekstu: ${pw}px — przeciągnij, aby zmienić · dwuklik: domyślna (${PAGE_WIDTH_DEFAULT}px)`
  const defTitle = `Szerokość domyślna (${PAGE_WIDTH_DEFAULT}px)`

  return (
    <div ref={ref} className="page-ruler">
      {w > 0 && (
        <>
          <div
            className="ruler-margin ruler-margin-left"
            style={{ left: 0, width: Math.max(0, textL) }}
          />
          <div
            className="ruler-margin ruler-margin-right"
            style={{ left: Math.min(w, textR), right: 0 }}
          />
          {pw !== PAGE_WIDTH_DEFAULT && w > PAGE_WIDTH_DEFAULT && (
            <>
              <span
                className="ruler-default"
                style={{ left: cx - defHalf + PAD }}
                title={defTitle}
              />
              <span
                className="ruler-default"
                style={{ left: cx + defHalf - PAD }}
                title={defTitle}
              />
            </>
          )}
          <span
            className="ruler-handle"
            style={{ left: clampX(textL) }}
            title={widthTitle}
            onPointerDown={dragWidth}
            onDoubleClick={resetWidth}
          />
          <span
            className="ruler-handle"
            style={{ left: clampX(textR) }}
            title={widthTitle}
            onPointerDown={dragWidth}
            onDoubleClick={resetWidth}
          />
          {editor && (
            <>
              <span
                className="ruler-ind ruler-ind-first"
                style={{ left: clampX(textL + ind.left + ind.first) }}
                title="Wcięcie pierwszej linii akapitu (lokalne — zaznaczone akapity) · dwuklik: zeruje"
                onPointerDown={dragFirst}
                onDoubleClick={() => applyIndents(editor, { ...ind, first: 0 })}
              />
              <span
                className="ruler-ind ruler-ind-left"
                style={{ left: clampX(textL + ind.left) }}
                title="Wcięcie tekstu akapitu z lewej (lokalne — zaznaczone akapity) · dwuklik: zeruje"
                onPointerDown={dragLeft}
                onDoubleClick={() => applyIndents(editor, { ...ind, left: 0 })}
              />
              <span
                className="ruler-ind ruler-ind-right"
                style={{ left: clampX(textR - ind.right) }}
                title="Wcięcie akapitu z prawej (lokalne — zaznaczone akapity) · dwuklik: zeruje"
                onPointerDown={dragRight}
                onDoubleClick={() => applyIndents(editor, { ...ind, right: 0 })}
              />
            </>
          )}
          {dragging && (
            <span className="ruler-label" style={{ left: cx }}>
              {pw}px
            </span>
          )}
        </>
      )}
    </div>
  )
}
