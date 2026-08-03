import { useEffect, useRef, useState } from 'react'
import { Icon, PICK_GROUPS, isIconName, type IconName } from './Icon'

/** Barwy znaczka. Te same, którymi malowane są typy klocków, plus akcent
 *  i szarość — żeby drzewo nie zaczęło świecić przypadkowymi kolorami. */
const BARWY: { hex: string; nazwa: string }[] = [
  { hex: '#31619e', nazwa: 'Niebieski' },
  { hex: '#6d4a9e', nazwa: 'Fioletowy' },
  { hex: '#b05575', nazwa: 'Różowy' },
  { hex: '#a8452f', nazwa: 'Ceglany' },
  { hex: '#a9742c', nazwa: 'Miodowy' },
  { hex: '#3d7a52', nazwa: 'Zielony' },
  { hex: '#3d6b54', nazwa: 'Akcent' },
  { hex: '#6b6b66', nazwa: 'Szary' },
]

interface Props {
  /** Nagłówek okienka, np. „Nazwa klocka". */
  title: string
  name: string
  /** Zapisany znaczek — pusty znaczy „zostaw domyślny". */
  icon?: string
  /** Barwa znaczka — pusta znaczy „zostaw domyślną". */
  iconColor?: string
  /** Znaczek pokazywany, gdy własnego nie wybrano (rola rzeczy w drzewie). */
  fallbackIcon: IconName
  /** Podpowiedź w pustym polu. */
  placeholder?: string
  onSave: (name: string, icon: string | undefined, iconColor: string | undefined) => void
  onClose: () => void
}

/** Okienko nazwy — zamiast systemowego `prompt`, który nie umie nic poza
 *  jedną linijką tekstu. Tu obok nazwy siedzi znaczek: klika się w niego
 *  i wybiera z siatki. Enter zapisuje, Escape zamyka bez zapisu. */
export function NameDialog({
  title,
  name,
  icon,
  iconColor,
  fallbackIcon,
  placeholder,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(name)
  const [pick, setPick] = useState<string | undefined>(icon)
  const [barwa, setBarwa] = useState<string | undefined>(iconColor)
  const [picking, setPicking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape najpierw zamyka siatkę znaczków, dopiero potem całe okienko
      if (picking) setPicking(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking, onClose])

  const zapisz = () => {
    const czysta = draft.trim()
    if (!czysta) return
    onSave(czysta, isIconName(pick) ? pick : undefined, barwa)
    onClose()
  }

  const pokazywany = isIconName(pick) ? pick : fallbackIcon

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal name-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <header className="name-dialog-head">
          <h3>{title}</h3>
        </header>

        <div className="name-dialog-row">
          <button
            className={`name-dialog-icon ${pick ? 'wybrany' : ''}`}
            title="Wybierz znaczek i jego barwę"
            style={barwa ? { color: barwa } : undefined}
            onClick={() => setPicking((o) => !o)}
          >
            <Icon name={pokazywany} size={1.25} />
          </button>
          <input
            ref={inputRef}
            className="input name-dialog-input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') zapisz()
            }}
          />
        </div>

        {picking && (
          <div className="icon-picker">
            <button
              className={`icon-picker-clear ${pick || barwa ? '' : 'active'}`}
              onClick={() => {
                setPick(undefined)
                setBarwa(undefined)
                setPicking(false)
              }}
            >
              <Icon name={fallbackIcon} size={1} />
              Bez własnego znaczka
            </button>

            {/* barwa osobno: dotyczy też domyślnego znaczka, więc siedzi
                nad siatką, a nie w niej */}
            <div className="icon-picker-group">
              <div className="icon-picker-label">Barwa</div>
              <div className="icon-picker-colors">
                <button
                  className={`icon-picker-color domyslna ${barwa ? '' : 'active'}`}
                  title="Domyślna (kolor typu)"
                  onClick={() => setBarwa(undefined)}
                />
                {BARWY.map((b) => (
                  <button
                    key={b.hex}
                    className={`icon-picker-color ${barwa === b.hex ? 'active' : ''}`}
                    style={{ background: b.hex }}
                    title={b.nazwa}
                    onClick={() => setBarwa(b.hex)}
                  />
                ))}
              </div>
            </div>
            {PICK_GROUPS.map((g) => (
              <div key={g.label} className="icon-picker-group">
                <div className="icon-picker-label">{g.label}</div>
                <div className="icon-picker-grid">
                  {g.names.map((n) => (
                    <button
                      key={n}
                      className={`icon-picker-btn ${pick === n ? 'active' : ''}`}
                      title={n}
                      style={barwa ? { color: barwa } : undefined}
                      onClick={() => {
                        setPick(n)
                        setPicking(false)
                      }}
                    >
                      <Icon name={n} size={1.15} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <footer className="name-dialog-foot">
          <button className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn btn-primary" disabled={!draft.trim()} onClick={zapisz}>
            Zapisz
          </button>
        </footer>
      </div>
    </div>
  )
}
