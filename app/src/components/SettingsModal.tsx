import { useEffect, useRef, useState } from 'react'
import { exportBackup, importBackup } from '../backup'
import {
  BLOCK_COLOR_DEFAULTS,
  BLOCK_TINT_MAX,
  BLOCK_TINT_MIN,
  IND_OFFSET_MAX,
  IND_OFFSET_MIN,
  PAGE_WIDTH_MAX,
  PAGE_WIDTH_MIN,
  getBlockColor,
  getBlockTint,
  getIndOffset,
  getPageWidth,
  getPageWidthDefault,
  hasCustomBlockColors,
  resetBlockColors,
  setBlockColor,
  setBlockTint,
  setIndOffset,
  setPageWidth,
  setPageWidthDefault,
} from '../uiSettings'
import { BLOCK_TYPE_LABELS, type BlockType } from '../types'

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
  const [width, setWidth] = useState(getPageWidth)
  const [widthDef, setWidthDef] = useState(getPageWidthDefault)
  const [indOff, setIndOff] = useState(getIndOffset)
  const [tint, setTint] = useState(getBlockTint)
  // przerysowanie próbek kolorów po zmianie/wyzerowaniu
  const [colorTick, setColorTick] = useState(0)
  // linijka nad edytorem zmienia to samo ustawienie — trzymaj suwaki w synchronizacji
  useEffect(() => {
    const h = () => {
      setWidth(getPageWidth())
      setWidthDef(getPageWidthDefault())
      setIndOff(getIndOffset())
      setTint(getBlockTint())
    }
    window.addEventListener('komp:ui', h)
    return () => window.removeEventListener('komp:ui', h)
  }, [])

  const applyTheme = (t: 'light' | 'dark') => {
    setTheme(t)
    document.documentElement.dataset.theme = t
    localStorage.setItem('ui.theme', t)
  }

  const applyWidth = (w: number) => {
    setWidth(w)
    setPageWidth(w)
  }

  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setBusy('export')
    setStatus(null)
    try {
      await exportBackup()
      setStatus('Kopia zapasowa pobrana.')
    } catch (e) {
      setStatus(`Błąd eksportu: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    if (
      !window.confirm(
        'Wczytać kopię zapasową? Klocki, wersje, foldery, ścieżki i PDF-y o tych ' +
          'samych identyfikatorach co w kopii zostaną nadpisane. Reszta danych zostaje bez zmian.',
      )
    ) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBusy('import')
    setStatus(null)
    try {
      const s = await importBackup(file)
      setStatus(
        `Wczytano: ${s.concepts} klocków, ${s.versions} wersji, ${s.folders} folderów, ` +
          `${s.paths} ścieżek, ${s.pdfs} PDF-ów.`,
      )
    } catch (e) {
      setStatus(`Błąd importu: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
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
              min={PAGE_WIDTH_MIN}
              max={PAGE_WIDTH_MAX}
              step={20}
              value={width}
              onChange={(e) => applyWidth(Number(e.target.value))}
            />
            <p className="settings-hint">
              Dotyczy edytora wizualnego, widoku Linia i Skryptu. Zmiany widać od
              razu. Możesz też przeciągać trójkąciki na linijce nad edytorem.
            </p>
          </div>
          <div className="settings-row">
            <span className="settings-label">
              Bazowa szerokość strony
              <span className="settings-value">{widthDef}px</span>
            </span>
            <input
              className="settings-slider"
              type="range"
              min={PAGE_WIDTH_MIN}
              max={PAGE_WIDTH_MAX}
              step={20}
              value={widthDef}
              onChange={(e) => setPageWidthDefault(Number(e.target.value))}
            />
            <p className="settings-hint">
              Do tej szerokości wraca dwuklik trójkącika na linijce i ją pokazują
              małe kreseczki.
            </p>
          </div>
          <div className="settings-row">
            <span className="settings-label">
              Odsunięcie znaczników wcięć
              <span className="settings-value">{indOff}px</span>
            </span>
            <input
              className="settings-slider"
              type="range"
              min={IND_OFFSET_MIN}
              max={IND_OFFSET_MAX}
              step={2}
              value={indOff}
              onChange={(e) => setIndOffset(Number(e.target.value))}
            />
            <p className="settings-hint">
              Jak daleko od zielonego trójkącika stoją bazowo niebieskie znaczniki
              wcięć na linijce.
            </p>
          </div>
          <div className="settings-row">
            <span className="settings-label">
              Kolory bloków
              {hasCustomBlockColors() && (
                <button
                  className="btn settings-reset"
                  title="Przywróć fabryczne kolory typów"
                  onClick={() => {
                    resetBlockColors()
                    setColorTick((t) => t + 1)
                  }}
                >
                  Przywróć
                </button>
              )}
            </span>
            <div className="settings-colors" key={colorTick}>
              {(Object.keys(BLOCK_COLOR_DEFAULTS) as BlockType[]).map((t) => (
                <label key={t} className="settings-color">
                  <input
                    type="color"
                    value={getBlockColor(t)}
                    onChange={(e) => {
                      setBlockColor(t, e.target.value)
                      setColorTick((x) => x + 1)
                    }}
                  />
                  <span>{BLOCK_TYPE_LABELS[t]}</span>
                </label>
              ))}
            </div>
            <span className="settings-label settings-sublabel">
              Nasycenie tła bloków
              <span className="settings-value">{tint}%</span>
            </span>
            <input
              className="settings-slider"
              type="range"
              min={BLOCK_TINT_MIN}
              max={BLOCK_TINT_MAX}
              step={2}
              value={tint}
              onChange={(e) => setBlockTint(Number(e.target.value))}
            />
            <p className="settings-hint">
              Kolor typu barwi pasek nagłówka, tło i kreskę przy treści bloku
              w widoku Linia i Skrypt. Przy 0% zostają same kreski i napisy.
            </p>
          </div>
          <div className="settings-row">
            <span className="settings-label">Kopia zapasowa</span>
            <div className="settings-backup-actions">
              <button className="btn" disabled={busy !== null} onClick={handleExport}>
                {busy === 'export' ? 'Pakuję…' : '⬇ Eksportuj kopię'}
              </button>
              <button
                className="btn"
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
              >
                {busy === 'import' ? 'Wczytuję…' : '⬆ Wczytaj kopię'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                hidden
                onChange={(e) => handleImportFile(e.target.files?.[0])}
              />
            </div>
            {status && <p className="settings-hint settings-status">{status}</p>}
            <p className="settings-hint">
              Eksport zapisuje wszystko (klocki, wersje, foldery, ścieżki, PDF-y) do
              jednego pliku .zip na dysku — to zarazem backup i sposób przeniesienia
              danych do innej przeglądarki lub komputera.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
