import { useState } from 'react'
import {
  addBlockType,
  countBlocksOfType,
  deleteBlockType,
  updateBlockType,
} from '../db'
import { useBlockTypes } from '../blockTypes'

/** Edytor typów klocków.
 *
 *  Typy przestały być zamkniętą listą w kodzie, bo każdy uczy się czego
 *  innego: komuś brakuje „Aksjomatu", komuś „Kontrprzykładu", a komuś
 *  „Lemat" jest zbędny. Tu się je dodaje, przemianowuje, przebarwia
 *  i chowa. Wszystko ląduje w bazie, więc jedzie też w kopii zapasowej. */
export function TypeEditor() {
  const typy = useBlockTypes()
  const [nowy, setNowy] = useState(false)
  const [nazwa, setNazwa] = useState('')
  const [skrot, setSkrot] = useState('')
  const [kolor, setKolor] = useState('#4a7a9e')
  const [blad, setBlad] = useState<string | null>(null)

  const dodaj = async () => {
    const n = nazwa.trim()
    if (!n) return
    await addBlockType(n, (skrot.trim() || n.slice(0, 3)).toUpperCase(), kolor)
    setNazwa('')
    setSkrot('')
    setNowy(false)
  }

  const usun = async (id: string, label: string) => {
    const ile = await countBlocksOfType(id)
    // klocki nie mogą zostać z typem, którego nie ma — muszą dostać inny
    const zamiennik = typy.all.find((t) => t.id !== id)
    if (!zamiennik) {
      setBlad('To ostatni typ — musi zostać przynajmniej jeden.')
      return
    }
    const pytanie =
      ile === 0
        ? `Usunąć typ „${label}"? Nie używa go żaden klocek.`
        : `Usunąć typ „${label}"? ${ile} ${
            ile === 1 ? 'klocek zmieni typ' : 'klocków zmieni typ'
          } na „${zamiennik.label}". Treść i wersje zostają nietknięte.`
    if (!window.confirm(pytanie)) return
    await deleteBlockType(id, zamiennik.id)
  }

  return (
    <div className="type-editor">
      {typy.all.map((t) => (
        <div className="type-row" key={t.id} data-typ={t.id} style={typy.style(t.id)}>
          <input
            className="type-row-color"
            type="color"
            value={t.color}
            title="Barwa typu"
            onChange={(e) => updateBlockType(t.id, { color: e.target.value })}
          />
          <span className="type-mini type-row-short" data-typ={t.id} style={typy.style(t.id)}>
            {t.short}
          </span>
          <input
            className="input type-row-name"
            value={t.label}
            title="Nazwa typu"
            onChange={(e) => updateBlockType(t.id, { label: e.target.value })}
          />
          <input
            className="input type-row-abbr"
            value={t.short}
            maxLength={4}
            title="Skrót na plakietce"
            onChange={(e) => updateBlockType(t.id, { short: e.target.value.toUpperCase() })}
          />
          <label className="type-row-hide" title="Czy proponować ten typ przy nowym klocku">
            <input
              type="checkbox"
              checked={!t.hidden}
              onChange={(e) => updateBlockType(t.id, { hidden: !e.target.checked })}
            />
            do wyboru
          </label>
          <button
            className="type-row-del"
            title={
              t.builtin
                ? 'Typ fabryczny — można go przemianować i schować, ale nie usunąć'
                : `Usuń typ „${t.label}"`
            }
            disabled={t.builtin}
            onClick={() => usun(t.id, t.label)}
          >
            ×
          </button>
        </div>
      ))}

      {blad && <p className="settings-hint settings-status">{blad}</p>}

      {nowy ? (
        <div className="type-row type-row-nowy">
          <input
            className="type-row-color"
            type="color"
            value={kolor}
            onChange={(e) => setKolor(e.target.value)}
          />
          <input
            className="input type-row-name"
            autoFocus
            placeholder="Nazwa, np. Aksjomat"
            value={nazwa}
            onChange={(e) => setNazwa(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && dodaj()}
          />
          <input
            className="input type-row-abbr"
            placeholder="AKS"
            maxLength={4}
            value={skrot}
            onChange={(e) => setSkrot(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && dodaj()}
          />
          <button className="btn btn-primary" disabled={!nazwa.trim()} onClick={dodaj}>
            Dodaj
          </button>
          <button className="btn" onClick={() => setNowy(false)}>
            Anuluj
          </button>
        </div>
      ) : (
        <button className="btn type-add" onClick={() => setNowy(true)}>
          + Nowy typ
        </button>
      )}
    </div>
  )
}
