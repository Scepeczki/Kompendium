import { useEffect, useRef, useState } from 'react'
import {
  LINE_SPACING_OPTIONS,
  MATH_GAP_OPTIONS,
  MATH_SCALE_OPTIONS,
  PARA_SPACING_OPTIONS,
  getLineSpacing,
  getMathGap,
  getMathScale,
  getParaSpacing,
  setLineSpacing,
  setMathGap,
  setMathScale,
  setParaSpacing,
} from '../uiSettings'

/** Menu odstępów tekstu (globalne): interlinia + odstęp między akapitami.
 *  Ustawienia działają wszędzie, gdzie renderuje się treść klocków. */
export function SpacingMenu() {
  const [open, setOpen] = useState(false)
  const [line, setLine] = useState(getLineSpacing)
  const [para, setPara] = useState(getParaSpacing)
  const [mScale, setMScale] = useState(getMathScale)
  const [mGap, setMGap] = useState(getMathGap)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', click)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', click)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="spacing-menu" ref={ref}>
      <button
        className={`btn rich-btn ${open ? 'btn-active' : ''}`}
        title="Odstępy tekstu: interlinia i odstęp akapitów (globalnie)"
        onClick={() => setOpen((o) => !o)}
      >
        ↕
      </button>
      {open && (
        <div className="spacing-pop">
          <div className="spacing-group">
            <span className="spacing-title">Interlinia</span>
            <div className="spacing-opts">
              {LINE_SPACING_OPTIONS.map((v) => (
                <button
                  key={v}
                  className={`btn spacing-opt ${line === v ? 'btn-active' : ''}`}
                  onClick={() => {
                    setLineSpacing(v)
                    setLine(v)
                  }}
                >
                  {v.toLocaleString('pl-PL', { minimumFractionDigits: 1 })}
                </button>
              ))}
            </div>
          </div>
          <div className="spacing-group">
            <span className="spacing-title">Odstęp między akapitami</span>
            <div className="spacing-opts">
              {PARA_SPACING_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className={`btn spacing-opt ${para === o.value ? 'btn-active' : ''}`}
                  onClick={() => {
                    setParaSpacing(o.value)
                    setPara(o.value)
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="spacing-group">
            <span className="spacing-title">Wielkość wzorów (względem tekstu)</span>
            <div className="spacing-opts">
              {MATH_SCALE_OPTIONS.map((v) => (
                <button
                  key={v}
                  className={`btn spacing-opt ${mScale === v ? 'btn-active' : ''}`}
                  title={v === 1 ? 'Wzór dokładnie tej samej wielkości co tekst' : undefined}
                  onClick={() => {
                    setMathScale(v)
                    setMScale(v)
                  }}
                >
                  {Math.round(v * 100)}%
                </button>
              ))}
            </div>
          </div>
          <div className="spacing-group">
            <span className="spacing-title">Odstęp wzorów wystawionych ($$)</span>
            <div className="spacing-opts">
              {MATH_GAP_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className={`btn spacing-opt ${mGap === o.value ? 'btn-active' : ''}`}
                  onClick={() => {
                    setMathGap(o.value)
                    setMGap(o.value)
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <p className="spacing-hint">
            Działa globalnie: edytor, podgląd, Linia i Skrypt.
          </p>
        </div>
      )}
    </div>
  )
}
