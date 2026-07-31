import { useEffect, useRef, useState } from 'react'
import {
  PAGE_WIDTH_DEFAULT,
  getPageWidth,
  setPageWidth,
} from '../uiSettings'

/** Linijka nad edytorem (jak w Google Docs): trójkąciki na krawędziach kolumny
 *  tekstu ustawiają jej szerokość (globalnie — tę samą co suwak w Ustawieniach).
 *  Małe kreseczki pokazują szerokość domyślną; dwuklik trójkąta ją przywraca. */
export function PageRuler() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [pw, setPw] = useState(getPageWidth)
  const [dragging, setDragging] = useState(false)

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

  const cx = w / 2
  const half = Math.min(pw, w) / 2
  const defHalf = Math.min(PAGE_WIDTH_DEFAULT, w) / 2
  /** Pozycje trójkącików nie wychodzą poza pasek. */
  const clampX = (x: number) => Math.min(w - 5, Math.max(5, x))

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = ref.current
    if (!el) return
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const raw = 2 * Math.abs(ev.clientX - r.left - r.width / 2)
      setPageWidth(Math.round(raw / 10) * 10)
    }
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const reset = () => setPageWidth(PAGE_WIDTH_DEFAULT)

  const handleTitle = `Szerokość tekstu: ${pw}px — przeciągnij, aby zmienić · dwuklik: domyślna (${PAGE_WIDTH_DEFAULT}px)`
  const defTitle = `Szerokość domyślna (${PAGE_WIDTH_DEFAULT}px)`

  return (
    <div ref={ref} className="page-ruler">
      {w > 0 && (
        <>
          <div
            className="ruler-margin ruler-margin-left"
            style={{ left: 0, width: Math.max(0, cx - half) }}
          />
          <div
            className="ruler-margin ruler-margin-right"
            style={{ left: Math.min(w, cx + half), right: 0 }}
          />
          {pw !== PAGE_WIDTH_DEFAULT && w > PAGE_WIDTH_DEFAULT && (
            <>
              <span
                className="ruler-default"
                style={{ left: cx - defHalf }}
                title={defTitle}
              />
              <span
                className="ruler-default"
                style={{ left: cx + defHalf }}
                title={defTitle}
              />
            </>
          )}
          <span
            className="ruler-handle"
            style={{ left: clampX(cx - half) }}
            title={handleTitle}
            onPointerDown={startDrag}
            onDoubleClick={reset}
          />
          <span
            className="ruler-handle"
            style={{ left: clampX(cx + half) }}
            title={handleTitle}
            onPointerDown={startDrag}
            onDoubleClick={reset}
          />
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
