/** Dostęp do typów klocków dla widoków.
 *
 *  Typy są danymi, więc każdy widok musi je czytać z bazy, a nie ze stałej
 *  w kodzie. Ten hook robi z tego jedną rzecz do zaimportowania: lista do
 *  wyboru, opis pojedynczego typu i gotowy `style` z jego barwą. */

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { unknownType, type BlockType, type BlockTypeDef } from './types'

/** Barwa typu jako zmienna CSS. Element z tym stylem musi mieć atrybut
 *  `data-typ` — arkusz przerabia wtedy `--kolor` na `--block-color`
 *  i rozjaśnia go w motywie ciemnym (patrz index.css). */
export const typeStyle = (def: BlockTypeDef): React.CSSProperties =>
  ({ '--kolor': def.color }) as React.CSSProperties

export interface BlockTypes {
  /** Wszystkie typy w kolejności — także schowane. */
  all: BlockTypeDef[]
  /** Typy proponowane przy nowym klocku (bez schowanych). */
  choices: BlockTypeDef[]
  /** Opis typu; dla nieznanego id awaryjny, żeby klocek nie zniknął. */
  def: (id: BlockType) => BlockTypeDef
  label: (id: BlockType) => string
  short: (id: BlockType) => string
  /** `style` z barwą typu — do pary z `data-typ={id}`. */
  style: (id: BlockType) => React.CSSProperties
  /** Czy dane już przyszły z bazy (pierwszy render ich nie ma). */
  ready: boolean
}

export function useBlockTypes(): BlockTypes {
  const rows = useLiveQuery(() => db.blockTypes.toArray(), [])
  const all = (rows ?? []).slice().sort((a, b) => a.order - b.order)
  const byId = new Map(all.map((t) => [t.id, t]))
  const def = (id: BlockType) => byId.get(id) ?? unknownType(id)
  return {
    all,
    choices: all.filter((t) => !t.hidden),
    def,
    label: (id) => def(id).label,
    short: (id) => def(id).short,
    style: (id) => typeStyle(def(id)),
    ready: rows !== undefined,
  }
}
