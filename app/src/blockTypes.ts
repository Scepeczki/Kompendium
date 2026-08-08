/** Dostęp do typów klocków dla widoków.
 *
 *  Typy są danymi, więc każdy widok musi je czytać z bazy, a nie ze stałej
 *  w kodzie. Ten hook robi z tego jedną rzecz do zaimportowania: lista do
 *  wyboru, opis pojedynczego typu i gotowy `style` z jego barwą. */

import { useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
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

// ---------------------------------------------------------------------------
// Jedna subskrypcja na cały program, nie jedna na kafelek.
//
// Wcześniej każde wywołanie hooka zakładało własne żywe zapytanie do bazy.
// W ścieżce z sześćdziesięcioma blokami dawało to sześćdziesiąt subskrypcji
// i sześćdziesiąt przebudów mapy typów przy każdym przerysowaniu — widoczne
// jako zacięcia przy przewijaniu. Teraz zapytanie jest jedno, a gotowy obiekt
// wyliczamy raz na zmianę danych i wszyscy dostają dokładnie ten sam.
// ---------------------------------------------------------------------------

const pusty: BlockTypes = zbuduj(undefined)

function zbuduj(rows: BlockTypeDef[] | undefined): BlockTypes {
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

let migawka = pusty
const sluchacze = new Set<() => void>()
let subskrypcja: { unsubscribe: () => void } | null = null

const zasubskrybuj = (fn: () => void) => {
  sluchacze.add(fn)
  if (!subskrypcja) {
    subskrypcja = liveQuery(() => db.blockTypes.toArray()).subscribe((rows) => {
      migawka = zbuduj(rows)
      for (const s of sluchacze) s()
    })
  }
  return () => {
    sluchacze.delete(fn)
    if (sluchacze.size === 0) {
      subskrypcja?.unsubscribe()
      subskrypcja = null
      // następny odbiorca dostanie świeże dane, a do tego czasu puste
      migawka = pusty
    }
  }
}

export function useBlockTypes(): BlockTypes {
  return useSyncExternalStore(zasubskrybuj, () => migawka, () => migawka)
}
