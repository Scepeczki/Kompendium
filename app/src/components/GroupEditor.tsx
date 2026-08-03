import { useEffect } from 'react'
import { BLOCK_TYPE_LABELS, BLOCK_TYPES, type BlockType } from '../types'

interface Props {
  name: string
  type?: BlockType
  onChangeName: (name: string) => void
  onChangeType: (type: BlockType | undefined) => void
  onClose: () => void
}

/** Okno edycji grupy klocków: nazwa nadana w tej ścieżce i to, czym grupa
 *  ma być (definicja, twierdzenie…) — od tego zależy etykieta i kolor. */
export function GroupEditor({
  name,
  type,
  onChangeName,
  onChangeType,
  onClose,
}: Props) {
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
              {BLOCK_TYPES.map((t) => (
                <button
                  key={t}
                  className={`btn group-type-btn type-border-${t} ${
                    type === t ? 'btn-active' : ''
                  }`}
                  onClick={() => onChangeType(t)}
                >
                  {BLOCK_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <p className="settings-hint">
              Grupa wygląda wtedy jak zwykły blok tego typu — z takim nagłówkiem
              i kolorem. Klocki w środku zostają osobnymi klockami w bazie.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
