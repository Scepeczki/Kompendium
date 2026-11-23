import Dexie, { type Table, type Transaction } from 'dexie'
import { db } from './db'

/** Wspólne cofanie całego programu (Ctrl+Z, ponawianie Ctrl+Y / Ctrl+Shift+Z).
 *
 *  Zapisujemy KAŻDĄ zmianę w bazie — kafelki, wersje, strony, foldery,
 *  ścieżki, sektory, listy zadań, PDF-y, rodzaje kafelków — a Linia dokłada
 *  swoje stany (kafelki i strzałki trzyma u siebie w pamięci). Zmiany, które
 *  przyszły razem (jedno działanie: np. zadanie z listy do Linii zmienia i
 *  Linię, i sektor), są jednym krokiem.
 *
 *  Nie cofa się postępów nauki (pamięć kafelków, historia, etapy i terminy
 *  sektorów) — to wyniki, nie edycja. */

type Klucz = string | number
/** Zmiana jednego rekordu: utworzenie (przed = brak), usunięcie (po = brak)
 *  albo zmiana pól — wtedy tylko te pola, które naprawdę się zmieniły. */
type ZmianaBazy =
  | { tabela: string; klucz: Klucz; rodzaj: 'nowy'; po: unknown }
  | { tabela: string; klucz: Klucz; rodzaj: 'usuniety'; przed: unknown }
  | { tabela: string; klucz: Klucz; rodzaj: 'pola'; przed: Record<string, unknown>; po: Record<string, unknown> }

export interface StanPlotna {
  nodes: unknown[]
  edges: unknown[]
}
interface ZmianaPlotna {
  pathId: string
  przed: StanPlotna
  po: StanPlotna
  /** Zapis stanu w bazie — gdy Linii tej ścieżki nie ma już na ekranie. */
  doBazy: (s: StanPlotna) => Promise<void>
}
interface Krok {
  baza: ZmianaBazy[]
  plotno: ZmianaPlotna[]
  ostatnio: number
}

/** Ile czasu między zmianami, żeby jeszcze były jednym krokiem (ms). */
const OKNO = 350
const LIMIT = 150

const wstecz: Krok[] = []
const wprzod: Krok[] = []
let wlaczone = false
/** W trakcie cofania — zmian nie zapisujemy. */
let stosujemy = false
/** Chwilę po cofnięciu Linia jeszcze dopasowuje sektory do przywróconego
 *  układu — to skutek cofnięcia, nie nowe działanie. */
let ciszaDo = 0

/** Linie na ekranie: ścieżka → przywrócenie stanu w pamięci. */
const plotna = new Map<string, (s: StanPlotna) => void>()
/** Linia zamknięta przed chwilą może jeszcze dokończyć autozapis — to jej
 *  stan, już zapisany w jej zdjęciach, nie nowe działanie. */
const zamknieteDo = new Map<string, number>()
const liniaPiszeSama = (pathId: string) => plotna.has(pathId) || (zamknieteDo.get(pathId) ?? 0) > Date.now()

/** Tabele cofane. Pamięć i historia nauki to wyniki — nie cofamy ich. */
const TABELE = ['concepts', 'versions', 'pdfs', 'folders', 'paths', 'subpages', 'relations', 'blockTypes', 'obrazy', 'nauka']
/** Pola, których zmiana sama w sobie nie jest działaniem. */
const ZNACZNIKI_CZASU = new Set(['updatedAt', 'zmieniono'])
/** Sektor/fiszka: pola, które się edytuje. Reszta to postęp nauki (etap,
 *  terminy, karta, luki…) — tego nie cofamy, cofnięcie nazwy nie może
 *  cofnąć zaliczonego testu. */
const NAUKA_EDYCJA = new Set(['nazwa', 'wezly', 'zadania', 'mapa', 'mapyKafelkow', 'wymagania', 'kolor', 'zakryjStrone', 'conceptId', 'nodeId', 'pathId'])

/** PDF-y i obrazki mają duże dane, których nikt nie zmienia w miejscu —
 *  wystarczy płytka kopia (głęboka kopiowałaby megabajty przy każdym zapisie). */
const PLYTKO = new Set(['pdfs', 'obrazy'])
/** Tekst pisany w edytorach: jego cofanie należy do edytora (Ctrl+Z w polu,
 *  litera po literze). Edytor nie wczytuje treści na nowo, więc cofnięta pod
 *  nim w bazie i tak wróciłaby z jego następnym zapisem. */
const POLA_TEKSTU: Record<string, Set<string>> = {
  versions: new Set(['content']),
  subpages: new Set(['content']),
  nauka: new Set(['mapa', 'mapyKafelkow', 'wymagania']),
}
const klon = <T>(x: T, tabela?: string): T => {
  if (tabela && PLYTKO.has(tabela)) return x && typeof x === 'object' ? ({ ...x } as T) : x
  try {
    return structuredClone(x)
  } catch {
    return x
  }
}
const rowne = (a: unknown, b: unknown) => {
  if (a === b) return true
  if (a instanceof Blob || b instanceof Blob || a instanceof ArrayBuffer || b instanceof ArrayBuffer) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

type Oznaczona = Transaction & { bezCofania?: boolean; skutek?: boolean; parent?: Transaction }
function znacznik(trans: Transaction | undefined, k: 'bezCofania' | 'skutek'): boolean {
  let t = trans as Oznaczona | undefined
  while (t) {
    if (t[k]) return true
    t = t.parent as Oznaczona | undefined
  }
  return false
}
function pomijamy(trans: Transaction | undefined): boolean {
  if (!wlaczone || stosujemy || Date.now() < ciszaDo) return true
  return znacznik(trans, 'bezCofania')
}

function biezacyKrok(): Krok {
  const t = Date.now()
  let k = wstecz[wstecz.length - 1]
  if (!k || t - k.ostatnio > OKNO) {
    k = { baza: [], plotno: [], ostatnio: t }
    wstecz.push(k)
    if (wstecz.length > LIMIT) wstecz.shift()
  }
  k.ostatnio = t
  wprzod.length = 0
  return k
}

/** Skutek wcześniejszego działania (np. Linia dopasowuje sektor do nowego
 *  miejsca kafelka, chwilę po przestawieniu) — dołącza do ostatniego kroku. */
let skutekTeraz = false
function dopiszBaze(z: ZmianaBazy) {
  const k = skutekTeraz && wstecz.length ? wstecz[wstecz.length - 1] : biezacyKrok()
  k.baza.push(z)
  powiadom()
}

/** Zmiana pól rekordu — tylko pola, które się zmieniły (i nie same znaczniki czasu). */
function zmianaPol(tabela: string, klucz: Klucz, stary: Record<string, unknown>, nowy: Record<string, unknown>) {
  const przed: Record<string, unknown> = {}
  const po: Record<string, unknown> = {}
  let istotna = false
  for (const k of new Set([...Object.keys(stary), ...Object.keys(nowy)])) {
    if (rowne(stary[k], nowy[k])) continue
    if (tabela === 'nauka' && !NAUKA_EDYCJA.has(k)) continue
    if (POLA_TEKSTU[tabela]?.has(k)) continue
    // ścieżka otwarta w Linii: jej kafelki i strzałki zapisuje autozapis —
    // ten stan cofa sama Linia (swoje zdjęcia), nie baza
    if (tabela === 'paths' && (k === 'nodes' || k === 'edges') && liniaPiszeSama(String(klucz))) continue
    przed[k] = stary[k]
    po[k] = nowy[k]
    if (!ZNACZNIKI_CZASU.has(k)) istotna = true
  }
  if (istotna) dopiszBaze({ tabela, klucz, rodzaj: 'pola', przed, po })
}

function jako(skutek: boolean, f: () => void) {
  skutekTeraz = skutek
  try {
    f()
  } finally {
    skutekTeraz = false
  }
}

/** Wywołane wewnątrz db.transaction: zmiany tej transakcji to skutek
 *  poprzedniego działania — cofają się razem z nim. */
export function oznaczSkutek() {
  const t = Dexie.currentTransaction as Oznaczona | null
  if (t) t.skutek = true
}

/** Zakłada haki na tabele — raz, przy starcie programu. */
export function podlaczCofanie() {
  for (const nazwa of TABELE) {
    const t = (db as unknown as Record<string, Table>)[nazwa]
    t.hook('creating', function (klucz, obj, trans) {
      if (pomijamy(trans)) return
      const po = klon(obj, nazwa)
      const sk = znacznik(trans, 'skutek')
      this.onsuccess = (k: Klucz) => jako(sk, () => dopiszBaze({ tabela: nazwa, klucz: k ?? klucz, rodzaj: 'nowy', po }))
    })
    t.hook('updating', function (mods, klucz, obj, trans) {
      if (pomijamy(trans)) return
      const stary = klon(obj, nazwa) as Record<string, unknown>
      const nowy = klon(obj, nazwa) as Record<string, unknown>
      for (const [k, v] of Object.entries(mods as Record<string, unknown>)) {
        if (v === undefined) Dexie.delByKeyPath(nowy, k)
        else Dexie.setByKeyPath(nowy, k, klon(v, nazwa))
      }
      const sk = znacznik(trans, 'skutek')
      this.onsuccess = () => jako(sk, () => zmianaPol(nazwa, klucz as Klucz, stary, nowy))
    })
    t.hook('deleting', function (klucz, obj, trans) {
      if (pomijamy(trans) || obj === undefined) return
      const przed = klon(obj, nazwa)
      const sk = znacznik(trans, 'skutek')
      this.onsuccess = () => jako(sk, () => dopiszBaze({ tabela: nazwa, klucz: klucz as Klucz, rodzaj: 'usuniety', przed }))
    })
  }
}

/** Od tej chwili zmiany są zapisywane (po starcie programu — zakładanie
 *  fabrycznych rodzajów kafelków i porządki przy starcie to nie działania). */
export function wlaczCofanie() {
  wlaczone = true
}

/** Wywołane wewnątrz db.transaction: zmiany tej transakcji nie trafiają do
 *  historii cofania. */
export function oznaczBezCofania() {
  const t = Dexie.currentTransaction as Oznaczona | null
  if (t) t.bezCofania = true
}

/** Uruchamia zmiany w bazie, których nie da się cofnąć (np. przywrócenie kopii). */
export async function bezCofania<T>(f: () => Promise<T>): Promise<T> {
  const byl = wlaczone
  wlaczone = false
  try {
    return await f()
  } finally {
    wlaczone = byl
  }
}

/** Linia na ekranie zgłasza się, żeby cofanie mogło przywrócić jej stan. */
export function zglosPlotno(pathId: string, przywroc: (s: StanPlotna) => void) {
  plotna.set(pathId, przywroc)
  return () => {
    if (plotna.get(pathId) === przywroc) {
      plotna.delete(pathId)
      zamknieteDo.set(pathId, Date.now() + 2000)
    }
  }
}

/** Linia zrobiła zdjęcie nowego stanu. `od` = kiedy zaczęła się ta seria zmian
 *  (zdjęcie robi się z opóźnieniem, a należy do działania z tamtej chwili). */
export function dopiszPlotno(z: ZmianaPlotna, od: number, koniec: number) {
  if (!wlaczone || stosujemy) return
  const t = koniec
  let k = wstecz[wstecz.length - 1]
  if (!k || od - k.ostatnio > OKNO) {
    k = { baza: [], plotno: [], ostatnio: t }
    wstecz.push(k)
    if (wstecz.length > LIMIT) wstecz.shift()
  }
  k.ostatnio = Math.max(k.ostatnio, t)
  wprzod.length = 0
  const juz = k.plotno.find((x) => x.pathId === z.pathId)
  if (juz) juz.po = z.po
  else k.plotno.push(z)
  powiadom()
}

async function zastosuj(k: Krok, wstecz: boolean) {
  stosujemy = true
  try {
    const zmiany = wstecz ? [...k.baza].reverse() : k.baza
    const tabele = [...new Set(zmiany.map((z) => z.tabela))]
    if (tabele.length) {
      await db.transaction('rw', tabele, async () => {
        for (const z of zmiany) {
          const t = db.table(z.tabela)
          if (z.rodzaj === 'pola') {
            const pola = wstecz ? z.przed : z.po
            // pola, których nie było — usuwamy (update z undefined kasuje pole)
            await t.update(z.klucz, klon(pola))
          } else if ((z.rodzaj === 'nowy') === wstecz) {
            await t.delete(z.klucz)
          } else {
            await t.put(klon(z.rodzaj === 'nowy' ? z.po : z.przed))
          }
        }
      })
    }
    // Linia po bazie: przywrócony kafelek musi już być, zanim wróci jego węzeł
    for (const p of k.plotno) {
      const s = wstecz ? p.przed : p.po
      const przywroc = plotna.get(p.pathId)
      if (przywroc) przywroc(s)
      else await p.doBazy(s)
    }
  } finally {
    stosujemy = false
    ciszaDo = Date.now() + 700
  }
}

let trwa = false
export async function cofnij(): Promise<boolean> {
  if (trwa) return false
  const k = wstecz.pop()
  if (!k) return false
  trwa = true
  try {
    await zastosuj(k, true)
    wprzod.push(k)
  } finally {
    trwa = false
    powiadom()
  }
  return true
}
export async function ponow(): Promise<boolean> {
  if (trwa) return false
  const k = wprzod.pop()
  if (!k) return false
  trwa = true
  try {
    await zastosuj(k, false)
    wstecz.push(k)
  } finally {
    trwa = false
    powiadom()
  }
  return true
}

export const czyMoznaCofnac = () => wstecz.length > 0
export const czyMoznaPonowic = () => wprzod.length > 0

function powiadom() {
  window.dispatchEvent(new Event('komp:cofanie'))
}

/** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y dla całego programu. W polu tekstowym
 *  cofanie należy do edytora — on wie o literach. */
export function wlaczSkrotyCofania() {
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const k = e.key.toLowerCase()
    const z = k === 'z' || e.code === 'KeyZ'
    const y = k === 'y' || e.code === 'KeyY'
    if (!z && !y) return
    const cel = e.target as Element | null
    if (cel?.closest?.('.tiptap, .cm-content, input, textarea, select, [contenteditable="true"]')) return
    e.preventDefault()
    if (y || e.shiftKey) void ponow()
    else void cofnij()
  })
}

/** Dla testów: ile kroków jest do cofnięcia. */
;(window as unknown as { __cofanie?: unknown }).__cofanie = { wstecz, wprzod }
