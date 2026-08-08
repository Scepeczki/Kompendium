import { useEffect } from 'react'
import { type BlockType } from '../types'
import { useBlockTypes } from '../blockTypes'
import { useDialogs } from './Dialogs'

interface Props {
  name: string
  type?: BlockType
  /** Przepisana treść całości; undefined = grupa pokazuje składniki po kolei. */
  content?: string
  /** Treści składników sklejone — punkt wyjścia do przepisania. */
  sklejone: string
  onChangeName: (name: string) => void
  onChangeType: (type: BlockType | undefined) => void
  onChangeContent: (content: string | undefined) => void
  onClose: () => void
}

/** Okno edycji grupy klocków: nazwa nadana w tej ścieżce i to, czym grupa
 *  ma być (definicja, twierdzenie…) — od tego zależy etykieta i kolor. */
export function GroupEditor({
  name,
  type,
  content,
  sklejone,
  onChangeName,
  onChangeType,
  onChangeContent,
  onClose,
}: Props) {
  const typy = useBlockTypes()
  const dlg = useDialogs()
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="note-modal-backdrop" onClick={onClose}>
      <div className="picker-modal group-editor" onClick={(e) => e.stopPropagation()}>
        <header className="note-modal-head">
          <h3>⧉ Grupa klocków</h3>
          <button className="btn btn-close" title="Zamknij (Escape)" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="settings-body">
          <div className="settings-row">
            <span className="settings-label">Nazwa w tej ścieżce</span>
            <input
              className="input"
              autoFocus
              value={name}
              placeholder="np. Kresy zbiorów"
              onChange={(e) => onChangeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onClose()}
            />
          </div>
          <div className="settings-row">
            <span className="settings-label">Czym jest ta grupa</span>
            <div className="group-type-choice">
              <button
                className={`btn group-type-btn ${!type ? 'btn-active' : ''}`}
                title="Bez typu — neutralna ramka „Grupa”"
                onClick={() => onChangeType(undefined)}
              >
                Grupa
              </button>
              {typy.choices.map((t) => (
                <button
                  key={t.id}
                  className={`btn group-type-btn ${type === t.id ? 'btn-active' : ''}`}
                  style={{ borderLeftColor: t.color }}
                  onClick={() => onChangeType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="settings-hint">
              Grupa wygląda wtedy jak zwykły blok tego typu — z takim nagłówkiem
              i kolorem. Klocki w środku zostają osobnymi klockami w bazie.
            </p>
          </div>

          <div className="settings-row">
            <span className="settings-label">
              Treść całości
              {content !== undefined && (
                <button
                  className="btn settings-reset"
                  title="Wróć do pokazywania treści składników po kolei"
                  onClick={async () => {
                    const ok = await dlg.confirm({
                      title: 'Porzucić przepisaną treść?',
                      message:
                        'Grupa wróci do pokazywania treści składników jedna po drugiej. ' +
                        'Tekst, który tu napisałeś, przepadnie. Same klocki są nietknięte.',
                      confirmLabel: 'Porzuć tekst',
                      danger: true,
                    })
                    if (ok) onChangeContent(undefined)
                  }}
                >
                  Porzuć
                </button>
              )}
            </span>
            {content === undefined ? (
              <>
                <button className="btn" onClick={() => onChangeContent(sklejone)}>
                  ✎ Przepisz na jeden tekst
                </button>
                <p className="settings-hint">
                  Dwie definicje sklejone jedna po drugiej rzadko czytają się
                  gładko — a bywa, że jedna ma wejść w środek drugiej. Tutaj
                  dostajesz ich treści razem i piszesz z nich jedną całość.
                  Klocki w bazie zostają nietknięte; ten tekst żyje tylko w tej
                  ścieżce.
                </p>
              </>
            ) : (
              <p className="settings-hint">
                Ten blok ma już własny tekst — pisze się go wprost w ścieżce,
                tak jak każdy inny. Wybór wersji i stron składników chowa się,
                dopóki tekst jest przepisany: liczy się to, co w nim stoi.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
