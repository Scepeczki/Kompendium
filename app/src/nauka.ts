/** Nauka i powtórki — logika bez wyglądu (VISION.md §5).
 *
 *  Jednostką nauki jest SEKTOR: grupa kafelków w Linii ścieżki z jednym
 *  terminem. Termin liczy FSRS (darmowy algorytm z Anki). Kafelek, który nie
 *  szedł, staje się SŁABY: ma własne, krótsze terminy, aż dogoni sektor.
 *  Każda powtórka dopisuje wpis do historii — z niej da się wszystko
 *  odtworzyć, a wpisów nigdy się nie zmienia. */

import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'
import { db } from './db'
import { topoOrder } from './topo'
import { czatWZero, wez } from './naukaUstawienia'
import type {
  JednostkaNauki,
  KartaFsrs,
  LearningPath,
  PamiecKafelka,
  PathNode,
  Przypomnienie,
  WpisNauki,
} from './types'

export type Ocena = 1 | 2 | 3 | 4

export const NAZWY_OCEN: Record<Ocena, string> = {
  1: 'Nie pamiętam',
  2: 'Trudno',
  3: 'Dobrze',
  4: 'Łatwo',
}

const teraz = () => new Date()
const uid = () => crypto.randomUUID()

// ---------------------------------------------------------------------------
// Dni — liczymy kalendarzowo, po czasie lokalnym. Powtórka „na jutro" jest
// na jutro przez cały dzień, a nie od tej samej godziny.

const pad = (n: number) => String(n).padStart(2, '0')
export const dzien = (d: Date | string) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
export const dzisiaj = () => dzien(teraz())
export const jutro = () => {
  const d = teraz()
  d.setDate(d.getDate() + 1)
  return dzien(d)
}
/** Ile dni od dziś do tego dnia (ujemne = zaległe). */
export function dniDo(termin: string, od = teraz()): number {
  const a = new Date(dzien(od) + 'T00:00:00')
  const b = new Date(dzien(termin) + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function opisDni(n: number): string {
  if (n <= 0) return n === 0 ? 'dziś' : `zaległe ${-n} ${-n === 1 ? 'dzień' : 'dni'}`
  if (n === 1) return 'jutro'
  if (n < 45) return `za ${n} dni`
  if (n < 400) return `za ${Math.round(n / 30.4)} mies.`
  return `za ${(n / 365).toFixed(1).replace('.', ',')} roku`
}

// ---------------------------------------------------------------------------
// FSRS

const planer = () =>
  fsrs(
    generatorParameters({
      request_retention: wez('cel') / 100,
      enable_fuzz: true,
      // terminy w pełnych dniach: tego samego dnia powtarza się przez
      // mapowanie i test, nie przez kroki minutowe
      enable_short_term: false,
    }),
  )

const doKarty = (k: KartaFsrs | undefined, kiedy: Date): Card =>
  k
    ? {
        ...k,
        state: k.state as Card['state'],
        due: new Date(k.due),
        last_review: k.last_review ? new Date(k.last_review) : undefined,
      }
    : createEmptyCard(kiedy)

const zKarty = (c: Card): KartaFsrs => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduled_days,
  reps: c.reps,
  lapses: c.lapses,
  learning_steps: c.learning_steps,
  state: c.state,
  last_review: c.last_review?.toISOString(),
})

export function nastepna(karta: KartaFsrs | undefined, ocena: Ocena, kiedy = teraz()): KartaFsrs {
  return zKarty(planer().next(doKarty(karta, kiedy), kiedy, ocena as Grade).card)
}

/** Co da każda ocena — do podpisów pod przyciskami („Dobrze → za 8 dni"). */
export function podglad(karta: KartaFsrs | undefined, kiedy = teraz()): Record<Ocena, number> {
  const p = planer().repeat(doKarty(karta, kiedy), kiedy)
  const out = {} as Record<Ocena, number>
  for (const o of [1, 2, 3, 4] as Ocena[]) out[o] = dniDo(p[o as Grade].card.due.toISOString(), kiedy)
  return out
}

/** Szansa, że jeszcze pamiętasz (0–1). */
export function pamietasz(karta: KartaFsrs | undefined, kiedy = teraz()): number {
  if (!karta || !karta.last_review) return 0
  return planer().retrievability(doKarty(karta, kiedy), kiedy)
}

// ---------------------------------------------------------------------------
// Ocena sektora z zaznaczeń

/** Podpowiedź oceny sektora: z odsetka kafelków, które nie poszły
 *  (Częściowo albo Nie), i z tego, jak poszła mapa. Zawsze można ją zmienić. */
export function podpowiedz(kafelki: Przypomnienie[], struktura?: Przypomnienie): Ocena {
  const zle = kafelki.filter((k) => k !== 'tak').length
  const frac = kafelki.length ? (zle / kafelki.length) * 100 : 0
  if (frac > wez('progNie')) return 1
  let o: Ocena = frac <= wez('progDobrze') ? 3 : 2
  // pamiętasz kafelki, ale nie strukturę — to nie jest „Dobrze"
  if (struktura && struktura !== 'tak' && o === 3) o = 2
  if (struktura === 'nie' && kafelki.length === 0) o = 1
  return o
}

const ocenaKafelka = (p: Przypomnienie): Ocena => (p === 'tak' ? 3 : p === 'czesciowo' ? 2 : 1)

/** Czy nadchodząca powtórka ma być rozszerzona: co kilka powtórek, nigdy na
 *  samym początku, a gdy terminy się oddalą — częściej. */
export function czyRozszerzona(j: JednostkaNauki): boolean {
  if (j.rodzaj !== 'sektor' || j.etap !== 'powtorki') return false
  const n = j.powtorek + 1
  if (n < wez('rozszOd')) return false
  const daleko = (j.karta?.scheduled_days ?? 0) >= wez('rozszDaleko')
  return n - j.ostatniaRozszerzona >= (daleko ? wez('rozszCoDaleko') : wez('rozszCo'))
}

// ---------------------------------------------------------------------------
// Kafelki sektora

/** Klucz pamięci: kafelek pamięta się wszędzie tak samo, więc kluczem jest
 *  jego id. Grupa nie ma kafelka w bibliotece — pamięta się ją w jej ścieżce. */
export function kluczWezla(n: PathNode, pathId: string): string | null {
  if (n.kind === 'block') return n.conceptId
  if (n.kind === 'fusion') return `grupa:${pathId}:${n.id}`
  return null
}

/** Czy węzeł się ocenia (kafelek albo grupa). Notatki, komentarze
 *  i rozdziały są tłem, nie porcją wiedzy. */
export const ocenialny = (n: PathNode) => n.kind === 'block' || n.kind === 'fusion'

/** Węzły sektora w kolejności Linii (bez komentarzy). */
export function wezlySektora(j: JednostkaNauki, sciezka: LearningPath | undefined): PathNode[] {
  if (!sciezka) return []
  const nale = new Set(j.wezly)
  return topoOrder(sciezka.nodes, sciezka.edges).filter((n) => nale.has(n.id) && n.kind !== 'comment')
}

const PALETA = ['#5b8def', '#e07a5f', '#3d9970', '#b07cc6', '#d4a017', '#2a9d8f', '#c8553d', '#7a869a']

// ---------------------------------------------------------------------------
// Sektory i fiszki

const nowaJednostka = (j: Partial<JednostkaNauki> & Pick<JednostkaNauki, 'rodzaj' | 'nazwa'>): JednostkaNauki => ({
  id: uid(),
  wezly: [],
  etap: 'nowy',
  powtorek: 0,
  ostatniaRozszerzona: 0,
  utworzono: teraz().toISOString(),
  zmieniono: teraz().toISOString(),
  ...j,
})

/** Nowy sektor z tych węzłów. Węzeł może być w jednym sektorze ścieżki,
 *  więc z innych sektorów tej ścieżki się go wyjmuje. */
export async function utworzSektor(pathId: string, nazwa: string, wezly: string[]): Promise<string> {
  const inne = await db.nauka.where('pathId').equals(pathId).toArray()
  const sektory = inne.filter((x) => x.rodzaj === 'sektor')
  const zajete = new Set(wezly)
  const j = nowaJednostka({
    rodzaj: 'sektor',
    pathId,
    nazwa,
    wezly,
    kolor: PALETA[sektory.length % PALETA.length],
  })
  await db.transaction('rw', db.nauka, async () => {
    for (const s of sektory) {
      if (!s.wezly.some((w) => zajete.has(w))) continue
      await db.nauka.update(s.id, { wezly: s.wezly.filter((w) => !zajete.has(w)), zmieniono: j.zmieniono })
    }
    await db.nauka.add(j)
  })
  return j.id
}

export async function zmienJednostke(id: string, zmiany: Partial<JednostkaNauki>) {
  await db.nauka.update(id, { ...zmiany, zmieniono: teraz().toISOString() })
}

/** Dokłada węzły do sektora (wyjmując je z innych sektorów tej ścieżki). */
export async function dolozDoSektora(id: string, wezly: string[]) {
  const j = await db.nauka.get(id)
  if (!j?.pathId) return
  const nowe = new Set(wezly)
  const inne = await db.nauka.where('pathId').equals(j.pathId).toArray()
  await db.transaction('rw', db.nauka, async () => {
    for (const s of inne) {
      if (s.id === id || s.rodzaj !== 'sektor' || !s.wezly.some((w) => nowe.has(w))) continue
      await db.nauka.update(s.id, { wezly: s.wezly.filter((w) => !nowe.has(w)) })
    }
    await db.nauka.update(id, {
      wezly: [...j.wezly.filter((w) => !nowe.has(w)), ...wezly],
      zmieniono: teraz().toISOString(),
    })
  })
}

export async function wyjmijZSektora(id: string, wezly: string[]) {
  const j = await db.nauka.get(id)
  if (!j) return
  const bez = new Set(wezly)
  await zmienJednostke(id, { wezly: j.wezly.filter((w) => !bez.has(w)) })
}

/** Usuwa sektor albo fiszkę. Kafelki zostają nietknięte, historia też. */
export async function usunJednostke(id: string) {
  await db.nauka.delete(id)
}

export async function utworzFiszke(f: {
  conceptId: string
  nazwa: string
  pathId?: string
  nodeId?: string
  zakryjStrone?: string | null
}): Promise<string> {
  const j = nowaJednostka({ rodzaj: 'fiszka', ...f })
  await db.nauka.add(j)
  return j.id
}

/** „Naucz od nowa": sektor wraca do powtórki zero. Historia zostaje, a pamięć
 *  kafelków też — wiedza o kafelku jest wspólna dla wszystkich ścieżek. */
export async function naukaOdNowa(id: string) {
  await db.transaction('rw', db.nauka, db.historia, async () => {
    await db.nauka.update(id, {
      etap: 'nowy',
      etapOd: undefined,
      karta: undefined,
      termin: undefined,
      doPoprawy: undefined,
      powtorek: 0,
      ostatniaRozszerzona: 0,
      zmieniono: teraz().toISOString(),
    })
    await db.historia.add({ id: uid(), kiedy: teraz().toISOString(), jednostkaId: id, typ: 'od-nowa' })
  })
}

// ---------------------------------------------------------------------------
// Powtórka zero: mapowanie → przerwa → test

export async function zacznijMapowanie(id: string) {
  await zmienJednostke(id, { etap: 'mapowanie', etapOd: teraz().toISOString() })
}

export async function skonczMapowanie(id: string) {
  await zmienJednostke(id, { etap: 'przerwa', etapOd: teraz().toISOString() })
}

/** Ile minut trwa przerwa (od końca mapowania). */
export function minutyPrzerwy(j: JednostkaNauki, kiedy = teraz()): number {
  if (j.etap !== 'przerwa' || !j.etapOd) return 0
  return (kiedy.getTime() - new Date(j.etapOd).getTime()) / 60000
}

/** Czy można już robić test: po przerwie albo w trakcie powtórek. */
export function testOtwarty(j: JednostkaNauki, kiedy = teraz()): boolean {
  if (j.etap === 'powtorki') return true
  if (j.rodzaj === 'fiszka' && j.etap === 'nowy') return true
  return j.etap === 'przerwa' && minutyPrzerwy(j, kiedy) >= wez('przerwa')
}

// ---------------------------------------------------------------------------
// Zapis sesji

export interface WynikSesji {
  /** Sektor albo fiszka. */
  jednostkaId?: string
  /** Albo jeden kafelek powtarzany osobno (słaby, nowy w sektorze). */
  klucz?: string
  ocena: Ocena
  /** Klucz pamięci → jak poszło. */
  kafelki: Record<string, Przypomnienie>
  /** Klucz pamięci → węzeł, przy którym go powtarzano. */
  wezlyKafelkow: Record<string, string>
  struktura?: Przypomnienie
  odpowiedzi?: Record<string, string>
  czasMs: number
  trudny?: boolean
  /** Powtórka rozszerzona: czym (czat albo trudny tryb). */
  rozszerzona?: 'czat' | 'trudny'
  /** Wynik testu czatem w powtórce rozszerzonej. */
  czat?: { zaliczone: boolean; luki?: string }
  /** Ścieżka sesji (do zapamiętania, gdzie kafelek był powtarzany). */
  pathId?: string
  /** Kafelek osobno: sektor, który ma dogonić. */
  sektorId?: string
}

export interface PoSesji {
  /** Termin następnej powtórki (brak = wraca do mapowania). */
  termin?: string
  slabe: number
  doPoprawy?: string[]
  uparte: string[]
  /** Powtórka zero idzie dalej: test czatem. */
  czat?: boolean
}

/** Zapisuje sesję: nowy termin, pamięć kafelków, wpis historii. */
export async function zapiszSesje(w: WynikSesji): Promise<PoSesji> {
  const kiedy = teraz()
  const iso = kiedy.toISOString()
  const wynik: PoSesji = { slabe: 0, uparte: [] }
  const progUpartego = wez('uparty')

  await db.transaction('rw', db.nauka, db.pamiec, db.historia, async () => {
    const j = w.jednostkaId ? await db.nauka.get(w.jednostkaId) : undefined
    const zero = !!j && j.etap !== 'powtorki'
    // test powtórki zero, który nie wyszedł: bez terminu, wracasz do mapowania
    // tych miejsc, które nie szły — pamięci kafelków jeszcze nie ruszamy
    const nieudanyStart = !!j && zero && !j.karta && w.ocena === 1

    let terminJednostki: string | undefined
    if (j) {
      const doPoprawy = Object.entries(w.kafelki)
        .filter(([, p]) => p !== 'tak')
        .map(([k]) => w.wezlyKafelkow[k])
        .filter(Boolean)
      if (nieudanyStart && j.rodzaj === 'fiszka') {
        // fiszka nie ma mapowania: zostaje nowa i wraca jeszcze dziś
        await db.nauka.update(j.id, { ostatnia: iso, zmieniono: iso })
      } else if (nieudanyStart) {
        await db.nauka.update(j.id, {
          etap: 'mapowanie',
          etapOd: iso,
          doPoprawy,
          ostatnia: iso,
          zmieniono: iso,
        })
        wynik.doPoprawy = doPoprawy
      } else {
        const karta = nastepna(j.karta, w.ocena, kiedy)
        terminJednostki = karta.due
        const powtorek = zero ? j.powtorek : j.powtorek + 1
        // pierwszy zaliczony test sektora: powtórka zero idzie dalej — do czatu
        const doCzatu = zero && !j.karta && j.rodzaj === 'sektor' && czatWZero() && w.ocena !== 1
        const rozsz = !!w.rozszerzona && !zero
        await db.nauka.update(j.id, {
          karta,
          termin: karta.due,
          etap: w.ocena === 1 ? 'mapowanie' : doCzatu ? 'czat' : 'powtorki',
          etapOd: iso,
          doPoprawy: w.ocena === 1 ? doPoprawy : undefined,
          powtorek,
          ostatniaRozszerzona: rozsz ? powtorek : j.ostatniaRozszerzona,
          rozszerzonych: rozsz ? (j.rozszerzonych ?? 0) + 1 : j.rozszerzonych,
          luki: w.czat ? (w.czat.zaliczone ? undefined : w.czat.luki || j.luki) : j.luki,
          ostatnia: iso,
          zmieniono: iso,
        })
        wynik.termin = karta.due
        if (doCzatu) wynik.czat = true
        if (w.ocena === 1) wynik.doPoprawy = doPoprawy
      }
    }

    // pamięć kafelków
    if (!nieudanyStart) {
      for (const [klucz, p] of Object.entries(w.kafelki)) {
        const stara = await db.pamiec.get(klucz)
        // kafelek powtarzany osobno dostaje ocenę z całej sesji, w sektorze —
        // z własnego zaznaczenia
        const o: Ocena = w.klucz ? w.ocena : ocenaKafelka(p)
        const karta = nastepna(stara?.karta, o, kiedy)
        const wpadki = (stara?.wpadki ?? 0) + (o === 1 && !zero && stara ? 1 : 0)
        // termin sektora, do którego kafelek ma dogonić
        const sektorId = j?.id ?? w.sektorId ?? stara?.jednostkaId
        let cel = terminJednostki
        if (!cel && w.klucz && sektorId) cel = (await db.nauka.get(sektorId))?.termin
        // nowy kafelek uczony osobno startuje jako słaby: ma dogonić sektor
        const bylSlaby = stara ? stara.slaby : !!w.klucz
        const slaby =
          j?.rodzaj === 'fiszka'
            ? false
            : o === 1
              ? true
              : !cel
                ? o < 3
                : (bylSlaby || o < 3) && dzien(karta.due) < dzien(cel)
        await db.pamiec.put({
          klucz,
          karta,
          termin: karta.due,
          slaby,
          wpadki,
          jednostkaId: sektorId,
          pathId: w.pathId ?? stara?.pathId,
          nodeId: w.wezlyKafelkow[klucz] ?? stara?.nodeId,
          zmieniono: iso,
        })
        if (slaby) wynik.slabe++
        if (wpadki >= progUpartego && o === 1) wynik.uparte.push(klucz)
      }
    }

    const wpis: WpisNauki = {
      id: uid(),
      kiedy: iso,
      jednostkaId: j?.id,
      klucz: w.klucz,
      typ: w.klucz ? 'kafelek' : zero ? 'test' : 'powtorka',
      trudny: w.trudny || undefined,
      rozszerzona: w.rozszerzona,
      czat: w.czat ? (w.czat.zaliczone ? 'zaliczone' : 'luki') : undefined,
      luki: w.czat?.luki || undefined,
      ocena: w.ocena,
      kafelki: w.kafelki,
      struktura: w.struktura,
      odpowiedzi: w.odpowiedzi && Object.keys(w.odpowiedzi).length ? w.odpowiedzi : undefined,
      czasMs: Math.round(w.czasMs),
      cel: wez('cel'),
    }
    await db.historia.add(wpis)
  })
  return wynik
}

/** Co rozszerza tę powtórkę: na zmianę czat i trudny tryb (później też
 *  zadania). Zaczyna czat — on sprawdza najwięcej. */
export function rodzajRozszerzonej(j: JednostkaNauki): 'czat' | 'trudny' {
  return (j.rozszerzonych ?? 0) % 2 === 0 ? 'czat' : 'trudny'
}

/** Wynik testu czatem w powtórce zero. Zaliczony kończy powtórkę zero; luki
 *  zostają przy sektorze — poprawiasz mapowanie tych miejsc i robisz dogrywkę. */
export async function wynikCzatu(id: string, zaliczone: boolean, luki?: string) {
  const iso = teraz().toISOString()
  await db.transaction('rw', db.nauka, db.historia, async () => {
    const j = await db.nauka.get(id)
    if (!j) return
    await db.nauka.update(id, {
      etap: zaliczone && j.etap === 'czat' ? 'powtorki' : j.etap,
      luki: zaliczone ? undefined : luki?.trim() || j.luki,
      zmieniono: iso,
    })
    await db.historia.add({
      id: uid(),
      kiedy: iso,
      jednostkaId: id,
      typ: 'czat',
      czat: zaliczone ? 'zaliczone' : 'luki',
      luki: zaliczone ? undefined : luki?.trim() || undefined,
    })
  })
}

/** Bez czatu tym razem (np. bez internetu) — zapisane, że pominięty. */
export async function pominCzat(id: string) {
  const iso = teraz().toISOString()
  await db.transaction('rw', db.nauka, db.historia, async () => {
    await db.nauka.update(id, { etap: 'powtorki', luki: undefined, zmieniono: iso })
    await db.historia.add({ id: uid(), kiedy: iso, jednostkaId: id, typ: 'czat', czat: 'pominiety' })
  })
}

/** „Przemapowałem" — uparty kafelek zaczyna liczyć wpadki od nowa. */
export async function przemapowany(klucz: string) {
  await db.pamiec.update(klucz, { wpadki: 0, zmieniono: teraz().toISOString() })
}

// ---------------------------------------------------------------------------
// Ile to potrwa — z własnej historii, a dopóki jej nie ma, z rozsądnych założeń

export interface Tempo {
  /** Minuty na jeden kafelek w sesji sektora. */
  naKafelek: number
  /** Stały koszt sesji sektora (mapa, pytania, ocena). */
  podstawa: number
  /** Jeden kafelek powtarzany osobno. */
  pojedynczy: number
  /** Ile dokłada trudny tryb. */
  trudny: number
}

export async function tempo(): Promise<Tempo> {
  const ost = await db.historia.orderBy('kiedy').reverse().limit(200).toArray()
  const sesje = ost.filter((h) => h.typ !== 'kafelek' && h.kafelki && h.czasMs).slice(0, 30)
  const pojedyncze = ost.filter((h) => h.typ === 'kafelek' && h.czasMs).slice(0, 30)
  const t: Tempo = { naKafelek: 1.2, podstawa: 3, pojedynczy: 1.5, trudny: 5 }
  if (sesje.length >= 3) {
    const min = sesje.reduce((a, h) => a + h.czasMs! / 60000, 0)
    const kaf = sesje.reduce((a, h) => a + Object.keys(h.kafelki!).length, 0)
    if (kaf > 0) {
      t.podstawa = 0
      t.naKafelek = min / kaf
    }
  }
  if (pojedyncze.length >= 3) {
    t.pojedynczy = pojedyncze.reduce((a, h) => a + h.czasMs! / 60000, 0) / pojedyncze.length
  }
  return t
}

// ---------------------------------------------------------------------------
// Plan: co dziś, co jutro

export interface Pozycja {
  /** Klucz do Reacta i do otwierania sesji. */
  id: string
  rodzaj: 'sektor' | 'fiszka' | 'kafelek'
  jednostka?: JednostkaNauki
  /** Kafelek osobno: jego klucz pamięci. */
  klucz?: string
  pamiec?: PamiecKafelka
  nazwa: string
  /** Gdzie (ścieżka / sektor) — do podpisu. */
  gdzie?: string
  minuty: number
  /** Dni do terminu (ujemne = zaległe). */
  dni: number
  /** Szansa, że jeszcze pamiętasz — najpierw najbardziej zagrożone. */
  pamiec01: number
  rozszerzona?: boolean
  /** Kafelek dołożony do nauczonego sektora — jeszcze go nie uczyłeś. */
  nowy?: boolean
  kafelkow?: number
}

export interface Plan {
  dzis: Pozycja[]
  jutro: Pozycja[]
  /** Powtórka zero w toku: mapowanie albo przerwa. */
  wToku: JednostkaNauki[]
  /** Uparte kafelki (wiele wpadek). */
  uparte: { pamiec: PamiecKafelka; nazwa: string }[]
  minutyDzis: number
  minutyJutro: number
}

export async function planNauki(kiedy = teraz()): Promise<Plan> {
  const [jednostki, pamiecWszystko, sciezki, kafelki, t] = await Promise.all([
    db.nauka.toArray(),
    db.pamiec.toArray(),
    db.paths.toArray(),
    db.concepts.toArray(),
    tempo(),
  ])
  const sciezka = new Map(sciezki.map((p) => [p.id, p]))
  const nazwaKafelka = new Map(kafelki.map((c) => [c.id, c.name]))
  const pamiec = new Map(pamiecWszystko.map((p) => [p.klucz, p]))
  const dzis = dzien(kiedy)
  const jutroD = (() => {
    const d = new Date(kiedy)
    d.setDate(d.getDate() + 1)
    return dzien(d)
  })()

  const nazwaKlucza = (k: string, p?: LearningPath, nodeId?: string): string => {
    if (!k.startsWith('grupa:')) return nazwaKafelka.get(k) ?? '(usunięty kafelek)'
    const n = p?.nodes.find((x) => x.id === nodeId)
    return n?.kind === 'fusion' ? n.name || 'Grupa' : 'Grupa'
  }

  const dzisL: Pozycja[] = []
  const jutroL: Pozycja[] = []
  const wToku: JednostkaNauki[] = []
  /** Sektory, które są dziś do powtórki — ich słabe kafelki idą razem z nimi. */
  const sektoryDzis = new Set<string>()

  for (const j of jednostki) {
    if (j.rodzaj === 'sektor' && (!j.pathId || !sciezka.has(j.pathId))) continue
    if (j.etap === 'mapowanie' || j.etap === 'przerwa' || j.etap === 'czat') {
      wToku.push(j)
      continue
    }
    const p = j.pathId ? sciezka.get(j.pathId) : undefined
    const wezly = j.rodzaj === 'sektor' ? wezlySektora(j, p).filter(ocenialny) : []
    const n = j.rodzaj === 'sektor' ? wezly.length : 1
    const rozszerzona = czyRozszerzona(j)
    const minuty =
      j.rodzaj === 'sektor'
        ? t.podstawa + t.naKafelek * n + (rozszerzona ? t.trudny : 0)
        : t.pojedynczy
    // nowa fiszka: od razu do nauki
    if (j.etap === 'nowy') {
      if (j.rodzaj === 'fiszka') {
        dzisL.push({ id: j.id, rodzaj: 'fiszka', jednostka: j, nazwa: j.nazwa, minuty, dni: 0, pamiec01: 0, nowy: true })
      }
      continue
    }
    if (!j.termin) continue
    const dni = dniDo(j.termin, kiedy)
    const poz: Pozycja = {
      id: j.id,
      rodzaj: j.rodzaj,
      jednostka: j,
      nazwa: j.nazwa,
      gdzie: p?.name,
      minuty,
      dni,
      pamiec01: pamietasz(j.karta, kiedy),
      rozszerzona,
      kafelkow: j.rodzaj === 'sektor' ? n : undefined,
    }
    if (dzien(j.termin) <= dzis) {
      dzisL.push(poz)
      sektoryDzis.add(j.id)
    } else if (dzien(j.termin) === jutroD) jutroL.push(poz)

    // kafelki dołożone do nauczonego sektora: uczy się ich osobno — chyba
    // że sektor i tak jest dziś, wtedy wchodzą w jego powtórkę
    if (j.rodzaj === 'sektor' && p && !sektoryDzis.has(j.id)) {
      for (const w of wezly) {
        const k = kluczWezla(w, p.id)
        if (!k || pamiec.has(k)) continue
        dzisL.push({
          id: `nowy:${k}`,
          rodzaj: 'kafelek',
          klucz: k,
          nazwa: nazwaKlucza(k, p, w.id),
          gdzie: j.nazwa,
          minuty: t.pojedynczy,
          dni: 0,
          pamiec01: 0,
          nowy: true,
          jednostka: j,
        })
      }
    }
  }

  // słabe kafelki osobno — chyba że ich sektor i tak jest dziś
  const uparte: Plan['uparte'] = []
  const progUpartego = wez('uparty')
  for (const pk of pamiecWszystko) {
    const p = pk.pathId ? sciezka.get(pk.pathId) : undefined
    // kafelek (albo grupa) już nie istnieje — nie ma czego powtarzać
    if (pk.klucz.startsWith('grupa:')) {
      if (!p?.nodes.some((n) => n.id === pk.nodeId)) continue
    } else if (!nazwaKafelka.has(pk.klucz)) continue
    if (pk.wpadki >= progUpartego) uparte.push({ pamiec: pk, nazwa: nazwaKlucza(pk.klucz, p, pk.nodeId) })
    if (!pk.slaby) continue
    const j = pk.jednostkaId ? jednostki.find((x) => x.id === pk.jednostkaId) : undefined
    if (j && j.etap !== 'powtorki') continue
    const poz: Pozycja = {
      id: `kafelek:${pk.klucz}`,
      rodzaj: 'kafelek',
      klucz: pk.klucz,
      pamiec: pk,
      nazwa: nazwaKlucza(pk.klucz, p, pk.nodeId),
      gdzie: j?.nazwa,
      minuty: t.pojedynczy,
      dni: dniDo(pk.termin, kiedy),
      pamiec01: pamietasz(pk.karta, kiedy),
      jednostka: j,
    }
    if (dzien(pk.termin) <= dzis) {
      if (j && sektoryDzis.has(j.id)) continue
      dzisL.push(poz)
    } else if (dzien(pk.termin) === jutroD) jutroL.push(poz)
  }

  dzisL.sort((a, b) => a.pamiec01 - b.pamiec01)
  const suma = (l: Pozycja[]) => l.reduce((a, x) => a + x.minuty, 0)
  return {
    dzis: dzisL,
    jutro: jutroL,
    wToku,
    uparte,
    minutyDzis: suma(dzisL),
    minutyJutro: suma(jutroL),
  }
}

/** Średnie obciążenie (minuty dziennie) w najbliższych dniach — do
 *  uprzedzenia przy zaczynaniu nowego sektora. */
export async function prognoza(dni = 14, kiedy = teraz()): Promise<number> {
  const [jednostki, pamiecW, sciezki, t] = await Promise.all([
    db.nauka.toArray(),
    db.pamiec.toArray(),
    db.paths.toArray(),
    tempo(),
  ])
  const sciezka = new Map(sciezki.map((p) => [p.id, p]))
  let suma = 0
  for (const j of jednostki) {
    if (j.etap !== 'powtorki' || !j.termin) continue
    const d = dniDo(j.termin, kiedy)
    if (d > dni) continue
    const n =
      j.rodzaj === 'sektor'
        ? wezlySektora(j, j.pathId ? sciezka.get(j.pathId) : undefined).filter(ocenialny).length
        : 1
    suma += j.rodzaj === 'sektor' ? t.podstawa + t.naKafelek * n : t.pojedynczy
  }
  for (const p of pamiecW) {
    if (p.slaby && dniDo(p.termin, kiedy) <= dni) suma += t.pojedynczy
  }
  return suma / dni
}

/** Ile kafelków (ocenianych węzłów) ma sektor. */
export function ileKafelkow(j: JednostkaNauki, p: LearningPath | undefined): number {
  return wezlySektora(j, p).filter(ocenialny).length
}

/** Słowna uwaga o wielkości sektora (cicha, nie blokuje). */
export function uwagaWielkosci(n: number): string | null {
  if (n === 0) return 'Pusty sektor — dołóż kafelki.'
  if (n < wez('sektorOd')) return `Mały sektor (${n}) — może połączyć z sąsiednim?`
  if (n > wez('sektorDo')) return `Duży sektor (${n}) — łatwiej uczyć się go w częściach.`
  return null
}
