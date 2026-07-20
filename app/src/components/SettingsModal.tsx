import { useEffect, useState } from 'react'

interface Props {
  onClose: () => void
}

/** Globalne ustawienia aplikacji: motyw i szerokość strony tekstu. */
export function SettingsModal({ onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? 'light',
  )
  const [width, setWidth] = useState(() => {
    const w = Number(localStorage.getItem('ui.pageWidth'))
    return w >= 560 && w <= 1400 ? w : 800
  })

  const applyTheme = (t: 'light' | 'dark') => {
    setTheme(t)
    document.documentElement.dataset.theme = t
    localStorage.setItem('ui.theme', t)
  }

  const applyWidth = (w: number) => {
    setWidth(w)
    document.documentElement.style.setProperty('--page-width', `${w}px`)
    localStorage.setItem('ui.pageWidth', String(w))
  }

  return (
    <div className="note-modal-backdrop" onClick={onClose}>
      <div className="note-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="note-modal-head">
          <h3>⚙ Ustawienia</h3>
          <button className="btn btn-close" title="Zamknij" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="settings-body">
          <div className="settings-row">
            <span className="settings-label">Motyw</span>
            <div className="view-switch">
              <button
                className={`btn ${theme === 'light' ? 'btn-active' : ''}`}
                onClick={() => applyTheme('light')}
              >
                ☀ Jasny
              </button>
              <button
                className={`btn ${theme === 'dark' ? 'btn-active' : ''}`}
                onClick={() => applyTheme('dark')}
              >
                ☾ Ciemny
              </button>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">
              Szerokość strony tekstu
              <span className="settings-value">{width}px</span>
            </span>
            <input
              className="settings-slider"
              type="range"
              min={560}
              max={1400}
              step={20}
              value={width}
              onChange={(e) => applyWidth(Number(e.target.value))}
            />
            <p className="settings-hint">
              Dotyczy edytora wizualnego, widoku Linia i Skryptu. Zmiany widać od razu.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
