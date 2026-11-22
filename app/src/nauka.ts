/** Nauka i powtórki — logika bez wyglądu (VISION.md §5).
 *
 *  Jednostką nauki jest SEKTOR: grupa kafelków w Linii ścieżki z jednym
 *  terminem. Termin liczy FSRS (darmowy algorytm z Anki). Kafelek, który nie
 *  szedł, staje się SŁABY: ma własne, krótsze terminy, aż dogoni sektor.
 *  Każda powtórka dopisuje wpis do historii — z niej da się wszystko
 *  odtworzyć, a wpisów nigdy się nie zmienia. */

import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'
import { createConcept, createSubpage, db, deleteConcept } from './db'
import { topoOrder } from './topo'
import { czatWZero, wez, zadaniaWZero } from './naukaUstawienia'
import type {
  JednostkaNauki,
  OcenaCzatu,
  KartaFsrs,
  LearningPath,
  PamiecKafelka,
  PathNode,
  BlockTypeDef,
  Przypomnienie,
  RodzajRozszerzonej,
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
  // czat pominięty w powtórce zero — najbliższa powtórka jest z czatem
  if (j.czatNastepnym) return true
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
// Powtórka zero: mapowanie → przerwa → test (→ czat → zadania → test końcowy)

export async function zacznijMapowanie(id: string) {
  await zmienJednostke(id, { etap: 'mapowanie', etapOd: teraz().toISOString() })
}

/** „Przerwij naukę": mapowanie albo przerwa się kończy, nic nie jest
 *  zaliczone. Mapa zostaje. Sektor nigdy nieuczony wraca do „nowy",
 *  a sektor w powtórkach (poprawki po nieudanej powtórce) — do powtórek. */
export async function przerwijNauke(id: string) {
  const j = await db.nauka.get(id)
  if (!j || (j.etap !== 'mapowanie' && j.etap !== 'przerwa')) return
  await zmienJednostke(id, {
    etap: j.karta ? 'powtorki' : 'nowy',
    etapOd: undefined,
    doPoprawy: j.karta ? j.doPoprawy : undefined,
  })
}

/** Zapis mapy jednego kafelka sektora (pozostałe mapy zostają). */
export async function zapiszMapeKafelka(id: string, klucz: string, md: string) {
  await db.transaction('rw', db.nauka, async () => {
    const j = await db.nauka.get(id)
    if (!j) return
    const mapy = { ...(j.mapyKafelkow ?? {}) }
    if (md.trim()) mapy[klucz] = md
    else delete mapy[klucz]
    await db.nauka.update(id, { mapyKafelkow: mapy, zmieniono: teraz().toISOString() })
  })
}

/** Zapis wymagań jednego kafelka sektora (pozostałe zostają). */
export async function zapiszWymagania(id: string, klucz: string, tekst: string) {
  await db.transaction('rw', db.nauka, async () => {
    const j = await db.nauka.get(id)
    if (!j) return
    const w = { ...(j.wymagania ?? {}) }
    if (tekst.trim()) w[klucz] = tekst
    else delete w[klucz]
    await db.nauka.update(id, { wymagania: w, zmieniono: teraz().toISOString() })
  })
}

/** Ile luk („??") zostało w mapie. */
export const ileLuk = (md: string | undefined) => (md?.match(/\?\?/g) ?? []).length

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
  /** Powtórka rozszerzona: czym (czat, zadania albo trudny tryb). */
  rozszerzona?: RodzajRozszerzonej
  /** Wynik testu czatem w powtórce rozszerzonej. `kafelki` — ocena czatu;
   *  `kafelki` w sesji są już łączne (gorsza z zakrytego i czatu). */
  czat?: { zaliczone: boolean; luki?: string; kafelki?: OcenaCzatu[]; zakryte?: Record<string, Przypomnienie> }
  /** Kafelki (klucz pamięci), które czat obniżył do Częściowo/Nie — zawsze słabe. */
  slabeZCzatu?: string[]
  /** Krótki test po przemapowaniu kafelków z NIE (po limicie dogrywek):
   *  terminów nie rusza, zamyka cykl i zeruje licznik dogrywek. */
  przemapowanie?: boolean
  /** Ścieżka sesji (do zapamiętania, gdzie kafelek był powtarzany). */
  pathId?: string
  /** Kafelek osobno: sektor, który ma dogonić. */
  sektorId?: string
  /** „Doucz nowe": test tylko z nowych — terminu sektora nie rusza, każdy
   *  element dostaje własną ocenę i startuje jako słaby. */
  douczanie?: boolean
}

export interface PoSesji {
  /** Termin następnej powtórki (brak = wraca do mapowania). */
  termin?: string
  slabe: number
  doPoprawy?: string[]
  uparte: string[]
  /** Powtórka zero idzie dalej: test czatem. */
  czat?: boolean
  /** Powtórka zero idzie dalej: zadania i test końcowy. */
  zadania?: boolean
  /** To był test końcowy (zaliczony, jeśli jest termin). */
  koncowy?: boolean
  /** To było douczanie nowych. */
  douczanie?: boolean
  /** To był krótki test po przemapowaniu — następna jest dogrywka. */
  przemapowanie?: boolean
}

const RANGA: Record<Przypomnienie, Ocena> = { tak: 3, czesciowo: 2, nie: 1 }
const Z_RANGI: Record<number, Przypomnienie> = { 1: 'nie', 2: 'czesciowo', 3: 'tak', 4: 'tak' }

/** Ocena łączna: gorsza z testu zakrytego i czatu. NIESPRAWDZONY i brak
 *  oceny czatu nie zmieniają niczego — czat może tylko obniżyć. */
export function laczna(zakryta: Przypomnienie, czat?: OcenaCzatu['ocena']): Przypomnienie {
  if (!czat || czat === 'niesprawdzony') return zakryta
  return RANGA[czat] < RANGA[zakryta] ? czat : zakryta
}

/** Ocena kafelka po czacie: twoja (gdy się nie zgodziłeś), inaczej czatu. */
export const ocenaPoCzacie = (k: OcenaCzatu): OcenaCzatu['ocena'] => k.twoja ?? k.ocena
/** Ocena, która się liczy (nie NIESPRAWDZONY, kafelek rozpoznany). */
const liczySie = (k: OcenaCzatu) => !!k.klucz && ocenaPoCzacie(k) !== 'niesprawdzony'

/** Klucz czatu (węzeł albo zadanie:id) → klucz pamięci. */
async function kluczePamieci(j: JednostkaNauki): Promise<Map<string, string>> {
  const sciezka = j.pathId ? await db.paths.get(j.pathId) : undefined
  const out = new Map<string, string>()
  for (const n of wezlySektora(j, sciezka).filter(ocenialny)) {
    const k = kluczWezla(n, sciezka?.id ?? '')
    if (k) out.set(n.id, k)
  }
  for (const id of j.zadania ?? []) out.set(kluczZadania(id), kluczZadania(id))
  return out
}

/** Luki czatu dopisane do wymagań kafelków (z oceną Częściowo/Nie);
 *  twoje „Tak" usuwa luki kafelka. Zwraca nową mapę (albo undefined, gdy pusta). */
function dopiszLuki(
  stare: Record<string, string[]> | undefined,
  kafelki: OcenaCzatu[],
): Record<string, string[]> | undefined {
  const m: Record<string, string[]> = { ...(stare ?? {}) }
  for (const k of kafelki) {
    if (!k.klucz) continue
    const o = ocenaPoCzacie(k)
    if (k.twoja === 'tak') {
      delete m[k.klucz]
      continue
    }
    if (o !== 'czesciowo' && o !== 'nie') continue
    const nowe = k.luki?.length ? k.luki : k.uwaga && k.ocena !== 'tak' ? [k.uwaga] : ['oznaczone przez ciebie po czacie']
    const l = [...(m[k.klucz] ?? [])]
    for (const x of nowe) if (!l.includes(x)) l.push(x)
    if (l.length) m[k.klucz] = l
  }
  return Object.keys(m).length ? m : undefined
}

/** Sprzeciwy z oceny czatu — do historii. */
const sprzeciwy = (kafelki?: OcenaCzatu[]) => {
  const l = (kafelki ?? []).filter((k) => k.twoja && k.twoja !== k.ocena).map((k) => ({ nazwa: k.nazwa, czat: k.ocena, twoja: k.twoja! }))
  return l.length ? l : undefined
}

/** Klucz pamięci → klucz luk/wymagań (węzeł albo zadanie:id). */
const kluczLuk = (k: string, wezly: Record<string, string>) => (czyZadanie(k) ? k : wezly[k])

/** Klucz zadania w sesji. Zadania liczą się do oceny sektora, ale nie mają
 *  własnej pamięci — wracają w powtórkach rozszerzonych, nie osobno. */
export const kluczZadania = (conceptId: string) => `zadanie:${conceptId}`
export const czyZadanie = (klucz: string) => klucz.startsWith('zadanie:')
export const idZadania = (klucz: string) => klucz.slice('zadanie:'.length)

/** Klucze, które kiedykolwiek były ocenione (z historii) — zadanie sprawdzone
 *  w teście, zanim zadania miały własną pamięć, nie jest „nowe". */
export async function znaneKlucze(): Promise<Set<string>> {
  const h = await db.historia.toArray()
  const out = new Set<string>()
  for (const w of h) for (const k of Object.keys(w.kafelki ?? {})) out.add(k)
  return out
}

/** Co w nauczonym sektorze jest nowe (jeszcze nieuczone): kafelki bez
 *  pamięci i zadania z paska, których nie było w żadnym teście. */
export function noweWSektorze(
  j: JednostkaNauki,
  sciezka: LearningPath | undefined,
  pamiec: { has: (k: string) => boolean },
  znane: Set<string>,
): { wezly: string[]; zadania: string[] } {
  if (j.rodzaj !== 'sektor' || j.etap !== 'powtorki' || !sciezka) return { wezly: [], zadania: [] }
  const wezly = wezlySektora(j, sciezka)
    .filter(ocenialny)
    .filter((n) => {
      const k = kluczWezla(n, sciezka.id)
      return !!k && !pamiec.has(k) && !znane.has(k)
    })
    .map((n) => n.id)
  const zadania = (j.zadania ?? []).filter((id) => !pamiec.has(kluczZadania(id)) && !znane.has(kluczZadania(id)))
  return { wezly, zadania }
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
    // test końcowy (po zadaniach): karta już jest z pierwszego testu, więc
    // terminu nie rusza — zaliczony kończy powtórkę zero, niezaliczony
    // zostawia sektor przy zadaniach z zaznaczonymi miejscami do poprawy
    const koncowy = !!j && j.etap === 'zadania' && !w.douczanie
    // test powtórki zero, który nie wyszedł: bez terminu, wracasz do mapowania
    // tych miejsc, które nie szły — pamięci kafelków jeszcze nie ruszamy
    const nieudanyStart = !!j && zero && !j.karta && w.ocena === 1

    let terminJednostki: string | undefined
    if (j) {
      const doPoprawy = Object.entries(w.kafelki)
        .filter(([, p]) => p !== 'tak')
        .map(([k]) => w.wezlyKafelkow[k])
        .filter(Boolean)
      if (w.przemapowanie) {
        // krótki test po przemapowaniu kafelków z NIE: terminów nie rusza,
        // zamyka cykl — licznik dogrywek od zera, następna jest dogrywka
        await db.nauka.update(j.id, { przemapowanie: undefined, dogrywek: 0, ostatnia: iso, zmieniono: iso })
        wynik.przemapowanie = true
      } else if (w.douczanie) {
        // sektor zostaje przy swoim terminie; nowe dogonią go osobno
        await db.nauka.update(j.id, { douczanie: undefined, ostatnia: iso, zmieniono: iso })
        wynik.douczanie = true
      } else if (koncowy) {
        const zle = w.ocena === 1
        await db.nauka.update(j.id, {
          etap: zle ? 'zadania' : 'powtorki',
          etapOd: iso,
          doPoprawy: zle ? doPoprawy : undefined,
          ostatnia: iso,
          zmieniono: iso,
        })
        wynik.koncowy = true
        if (zle) wynik.doPoprawy = doPoprawy
        else wynik.termin = j.termin
      } else if (nieudanyStart && j.rodzaj === 'fiszka') {
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
        // bez czatu od razu zadania (też opcjonalne)
        const doZadan = zero && !j.karta && j.rodzaj === 'sektor' && !doCzatu && zadaniaWZero() && w.ocena !== 1
        const rozsz = !!w.rozszerzona && !zero
        await db.nauka.update(j.id, {
          karta,
          termin: karta.due,
          etap: w.ocena === 1 ? 'mapowanie' : doCzatu ? 'czat' : doZadan ? 'zadania' : 'powtorki',
          etapOd: iso,
          doPoprawy: w.ocena === 1 ? doPoprawy : undefined,
          powtorek,
          ostatniaRozszerzona: rozsz ? powtorek : j.ostatniaRozszerzona,
          rozszerzonych: rozsz ? (j.rozszerzonych ?? 0) + 1 : j.rozszerzonych,
          luki: w.czat ? (w.czat.zaliczone ? undefined : w.czat.luki || j.luki) : j.luki,
          czatNastepnym: w.rozszerzona === 'czat' && w.czat ? undefined : j.czatNastepnym,
          ostatnia: iso,
          zmieniono: iso,
        })
        wynik.termin = karta.due
        if (doCzatu) wynik.czat = true
        if (doZadan) wynik.zadania = true
        if (w.ocena === 1) wynik.doPoprawy = doPoprawy
      }
    }

    // pamięć kafelków (test końcowy jej nie rusza — kafelki oceniłeś dziś w pierwszym teście)
    if (!nieudanyStart && !koncowy && !w.przemapowanie) {
      for (const [klucz, p] of Object.entries(w.kafelki)) {
        const stara = await db.pamiec.get(klucz)
        // kafelek powtarzany osobno dostaje ocenę z całej sesji, w sektorze —
        // z własnego zaznaczenia
        const o: Ocena = w.klucz ? w.ocena : ocenaKafelka(p)
        const karta = nastepna(stara?.karta, o, kiedy)
        const wpadki = (stara?.wpadki ?? 0) + (o === 1 && !zero && stara ? 1 : 0)
        // termin sektora, do którego kafelek ma dogonić
        const sektorId = j?.id ?? w.sektorId ?? stara?.jednostkaId
        let cel = terminJednostki ?? (w.douczanie ? j?.termin : undefined)
        if (!cel && w.klucz && sektorId) cel = (await db.nauka.get(sektorId))?.termin
        // nowy kafelek uczony osobno startuje jako słaby: ma dogonić sektor
        const bylSlaby = stara ? stara.slaby : !!w.klucz || !!w.douczanie
        const slaby =
          j?.rodzaj === 'fiszka'
            ? false
            : o === 1 || !!w.slabeZCzatu?.includes(klucz)
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
          // żeby czat mógł tę ocenę jeszcze obniżyć (ocena łączna z tego dnia)
          przed: { karta: stara?.karta, slaby: stara?.slaby ?? false, ocena: o, kiedy: iso },
          jednostkaId: sektorId,
          pathId: w.pathId ?? stara?.pathId,
          nodeId: w.wezlyKafelkow[klucz] ?? stara?.nodeId,
          zmieniono: iso,
        })
        if (slaby) wynik.slabe++
        if (wpadki >= progUpartego && o === 1) wynik.uparte.push(klucz)
      }
    }

    // luki z czatu w wymaganiach: Tak w teście zakrytym je zamyka,
    // a czat w powtórce rozszerzonej dopisuje nowe
    const sektorLuk = j?.rodzaj === 'sektor' ? j.id : w.sektorId
    const s = sektorLuk ? await db.nauka.get(sektorLuk) : undefined
    if (s && (s.lukiKafelkow || w.czat?.kafelki?.length)) {
      let m: Record<string, string[]> | undefined = { ...(s.lukiKafelkow ?? {}) }
      for (const [k, p] of Object.entries(w.kafelki)) {
        const kl = kluczLuk(k, w.wezlyKafelkow)
        if (p === 'tak' && kl) delete m[kl]
      }
      if (w.czat?.kafelki?.length) m = dopiszLuki(m, w.czat.kafelki)
      await db.nauka.update(s.id, { lukiKafelkow: m && Object.keys(m).length ? m : undefined })
    }

    const wpis: WpisNauki = {
      id: uid(),
      kiedy: iso,
      jednostkaId: j?.id,
      czatKafelki: w.czat?.kafelki?.length ? w.czat.kafelki : undefined,
      zakryte: w.czat?.kafelki?.length ? w.czat.zakryte : undefined,
      lacznie: w.czat?.kafelki?.length ? w.kafelki : undefined,
      sprzeciwy: sprzeciwy(w.czat?.kafelki),
      przemapowanie: w.przemapowanie || undefined,
      klucz: w.klucz,
      typ: w.klucz ? 'kafelek' : w.douczanie ? 'douczanie' : koncowy ? 'koncowy' : zero ? 'test' : 'powtorka',
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

/** Co rozszerza tę powtórkę: na zmianę czat, zadania (jeśli sektor je ma)
 *  i trudny tryb. Zaczyna czat — on sprawdza najwięcej. */
export function rodzajRozszerzonej(j: JednostkaNauki, ileZadan = j.zadania?.length ?? 0): RodzajRozszerzonej {
  if (j.czatNastepnym) return 'czat'
  const kolej: RodzajRozszerzonej[] = ileZadan > 0 ? ['czat', 'zadanie', 'trudny'] : ['czat', 'trudny']
  return kolej[(j.rozszerzonych ?? 0) % kolej.length]
}

/** Które zadania wchodzą do tej powtórki rozszerzonej: kilka naraz,
 *  a następnym razem kolejne — po kolei przez wszystkie. */
export function zadaniaDoPowtorki(j: JednostkaNauki, wazne: string[]): string[] {
  const n = wazne.length
  if (!n) return []
  const k = Math.min(n, wez('zadanWPowtorce'))
  const runda = Math.floor((j.rozszerzonych ?? 0) / 3)
  const od = (runda * k) % n
  return Array.from({ length: k }, (_, i) => wazne[(od + i) % n])
}

// ---------------------------------------------------------------------------
// Zadania sektora

export interface NoweZadanie {
  nazwa?: string
  tresc?: string
  rozwiazanie?: string
  metoda?: string
}

/** Strony zadania. Treść widać w teście, rozwiązanie jest zakryte (z tokiem
 *  rozumowania — o metodę tu chodzi, nie o rachunki). */
export const STRONY_ZADANIA = ['Rozwiązanie'] as const

/** Rodzaj „Zadanie" z listy rodzajów kafelków. Fabryczny ma id `zadanie`,
 *  ale ktoś mógł go skasować i zrobić własny — wtedy szukamy po nazwie. */
export function znajdzTypZadania(typy: BlockTypeDef[]): string {
  return (
    typy.find((t) => t.id === 'zadanie')?.id ??
    typy.find((t) => /^zadani/i.test(t.label.trim()))?.id ??
    typy.find((t) => /^zad$/i.test(t.short.trim()))?.id ??
    'zadanie'
  )
}

export const typZadania = async () => znajdzTypZadania(await db.blockTypes.toArray())

/** Zadania sektora z rodzajem, którego już nie ma (szare), dostają
 *  właściwy rodzaj „Zadanie". */
export async function naprawTypZadan(ids: string[]) {
  if (!ids.length) return
  const typy = await db.blockTypes.toArray()
  const znane = new Set(typy.map((t) => t.id))
  const typ = znajdzTypZadania(typy)
  if (!znane.has(typ)) return
  const cs = await db.concepts.bulkGet(ids)
  for (const c of cs) if (c && !znane.has(c.type)) await db.concepts.update(c.id, { type: typ })
}

/** Dokłada albo wyjmuje węzeł z sektora (tryb wybierania kafelków). */
export async function przelaczWSektorze(id: string, nodeId: string) {
  const j = await db.nauka.get(id)
  if (!j) return
  if (j.wezly.includes(nodeId)) await wyjmijZSektora(id, [nodeId])
  else await dolozDoSektora(id, [nodeId])
}

/** Tworzy kafelki-zadania w folderze ścieżki i przypina je do sektora. */
export async function utworzZadania(sektorId: string, lista: NoweZadanie[]): Promise<string[]> {
  const j = await db.nauka.get(sektorId)
  if (!j?.pathId) return []
  const ids: string[] = []
  const bylo = j.zadania?.length ?? 0
  for (const [i, z] of lista.entries()) {
    const id = await createConcept(await typZadania(), j.pathId)
    const c = await db.concepts.get(id)
    if (!c) continue
    await db.concepts.update(id, { name: z.nazwa?.trim() || `Zadanie ${bylo + i + 1}` })
    await db.versions.update(c.currentVersionId, { content: z.tresc?.trim() ?? '' })
    // czat mógł jeszcze podać metodę osobno — dopisujemy ją do rozwiązania
    const tresci = [
      [z.rozwiazanie?.trim(), z.metoda?.trim() ? `**Metoda:** ${z.metoda.trim()}` : ''].filter(Boolean).join('\n\n'),
    ]
    for (const [k, nazwa] of STRONY_ZADANIA.entries()) {
      const s = await createSubpage(id, c.currentVersionId, nazwa)
      if (tresci[k]?.trim()) await db.subpages.update(s, { content: tresci[k]!.trim() })
    }
    ids.push(id)
  }
  const pozniej = await db.nauka.get(sektorId)
  await zmienJednostke(sektorId, { zadania: [...(pozniej?.zadania ?? []), ...ids] })
  return ids
}

/** Odpina zadanie od sektora. Kafelek zostaje w folderze ścieżki. */
export async function odepnijZadanie(sektorId: string, conceptId: string) {
  const j = await db.nauka.get(sektorId)
  if (!j) return
  await zmienJednostke(sektorId, { zadania: (j.zadania ?? []).filter((x) => x !== conceptId) })
}

/** Przypina istniejący kafelek jako zadanie sektora (do paska). */
export async function przypnijZadanie(sektorId: string, conceptId: string) {
  const j = await db.nauka.get(sektorId)
  if (!j || j.zadania?.includes(conceptId)) return
  await zmienJednostke(sektorId, { zadania: [...(j.zadania ?? []), conceptId] })
}

/** Usuwa zadanie na dobre — wołać tylko po pytaniu. */
export async function usunZadanie(sektorId: string, conceptId: string) {
  await odepnijZadanie(sektorId, conceptId)
  await deleteConcept(conceptId)
}

/** Zmienia kolejność zadań (o jedno miejsce w górę albo w dół). */
export async function przesunZadanie(sektorId: string, conceptId: string, o: -1 | 1) {
  const j = await db.nauka.get(sektorId)
  const l = [...(j?.zadania ?? [])]
  const i = l.indexOf(conceptId)
  const k = i + o
  if (i < 0 || k < 0 || k >= l.length) return
  const x = l[i]
  l[i] = l[k]
  l[k] = x
  await zmienJednostke(sektorId, { zadania: l })
}

/** „Doucz nowe": zaczyna mapowanie samych nowych elementów sektora. */
export async function zacznijDouczanie(id: string, nowe: { wezly: string[]; zadania: string[] }) {
  await zmienJednostke(id, { douczanie: { ...nowe, etap: 'mapowanie', od: teraz().toISOString() } })
}

export async function skonczMapowanieDouczania(id: string) {
  const j = await db.nauka.get(id)
  if (!j?.douczanie) return
  await zmienJednostke(id, { douczanie: { ...j.douczanie, etap: 'przerwa', od: teraz().toISOString() } })
}

export async function przerwijDouczanie(id: string) {
  await zmienJednostke(id, { douczanie: undefined })
}

/** Minuty przerwy w douczaniu (od końca mapowania nowych). */
export function minutyDouczania(j: JednostkaNauki, kiedy = teraz()): number {
  if (j.douczanie?.etap !== 'przerwa') return 0
  return (kiedy.getTime() - new Date(j.douczanie.od).getTime()) / 60000
}

export const douczanieOtwarte = (j: JednostkaNauki, kiedy = teraz()) =>
  j.douczanie?.etap === 'przerwa' && minutyDouczania(j, kiedy) >= wez('przerwa')

/** Bez zadań tym razem — powtórka zero kończy się bez testu końcowego. */
export async function pominZadania(id: string) {
  await zmienJednostke(id, { etap: 'powtorki', doPoprawy: undefined })
}

/** Tryb próbny: zapis dzieje się naprawdę, ale w transakcji, którą na końcu
 *  wycofujemy. Wynik (ocena, termin, co do poprawy) jest prawdziwy, a w bazie
 *  — sektorach, pamięci, historii — nie zmienia się nic. */
class Proba extends Error {}
export async function naProbe<T>(f: () => Promise<T>): Promise<T> {
  let wynik: T | undefined
  let doszlo = false
  try {
    // ścieżki i kafelki tylko do odczytu (dopasowanie kafelków czatu), ale muszą być w tej transakcji
    await db.transaction('rw', [db.nauka, db.pamiec, db.historia, db.paths, db.concepts], async () => {
      wynik = await f()
      doszlo = true
      throw new Proba('próba — wycofane')
    })
  } catch (e) {
    if (!doszlo) throw e
  }
  return wynik as T
}

/** Dopasowuje nazwy kafelków z odpowiedzi czatu do kafelków sektora
 *  (najpierw dokładnie, potem „jedna nazwa zawiera drugą"). */
export async function dopasujKafelkiCzatu(
  j: JednostkaNauki,
  kafelki: Omit<OcenaCzatu, 'klucz'>[],
): Promise<OcenaCzatu[]> {
  const kandydaci = await nazwyKafelkowSektora(j)
  const norm = (s: string) => s.toLowerCase().replace(/[„”"'«»*_`]/g, '').replace(/\s+/g, ' ').trim()
  return kafelki.map((k) => {
    const n = norm(k.nazwa)
    const trafiony =
      kandydaci.find((c) => norm(c.nazwa) === n) ??
      kandydaci.find((c) => norm(c.nazwa) && (n.includes(norm(c.nazwa)) || norm(c.nazwa).includes(n)))
    return { ...k, klucz: trafiony?.klucz }
  })
}

/** Kafelki sektora z nazwami, tak jak widzi je czat (klucz: węzeł albo zadanie:id). */
export async function nazwyKafelkowSektora(j: JednostkaNauki): Promise<{ klucz: string; nazwa: string }[]> {
  const sciezka = j.pathId ? await db.paths.get(j.pathId) : undefined
  const kandydaci: { klucz: string; nazwa: string }[] = []
  for (const n of wezlySektora(j, sciezka).filter(ocenialny)) {
    if (n.kind === 'block') {
      const c = await db.concepts.get(n.conceptId)
      kandydaci.push({ klucz: n.id, nazwa: n.nazwa ?? c?.name ?? '' })
    } else if (n.kind === 'fusion') kandydaci.push({ klucz: n.id, nazwa: n.name || 'Grupa' })
  }
  for (const id of j.zadania ?? []) {
    const c = await db.concepts.get(id)
    if (c) kandydaci.push({ klucz: kluczZadania(id), nazwa: c.name })
  }
  return kandydaci
}

/** Próba: test zakryty „na niby" przed czatem — sektor jak tuż po mapowaniu,
 *  każdy kafelek z podaną oceną (domyślnie Tak). Tylko wewnątrz `naProbe`. */
export async function symulujTestZakryty(j: JednostkaNauki, oceny: (klucz: string) => Przypomnienie = () => 'tak') {
  const klucze = await kluczePamieci(j)
  const kafelki: Record<string, Przypomnienie> = {}
  const wezlyKafelkow: Record<string, string> = {}
  for (const [kc, kp] of klucze) {
    kafelki[kp] = oceny(kc)
    wezlyKafelkow[kp] = czyZadanie(kp) ? idZadania(kp) : kc
  }
  await db.nauka.put({ ...j, etap: 'przerwa', karta: undefined, termin: undefined, douczanie: undefined })
  const ocena = podpowiedz(Object.values(kafelki))
  await zapiszSesje({
    jednostkaId: j.id,
    ocena: ocena === 1 ? 2 : ocena,
    kafelki,
    wezlyKafelkow,
    czasMs: 0,
    pathId: j.pathId,
  })
}

/** Co zmienił wynik czatu — do pokazania zaraz po zapisie. */
export interface PoCzacie {
  zaliczone: boolean
  /** To była dogrywka (były luki z poprzedniego czatu). */
  dogrywka: boolean
  /** Etap sektora po zapisie. */
  etap: JednostkaNauki['etap']
  /** Kafelki z oceną łączną (gorsza z zakrytego i czatu) — tylko te, które czat ocenił. */
  kafelki: { nazwa: string; zakryta?: Przypomnienie; czat: OcenaCzatu['ocena']; twoja?: OcenaCzatu['ocena']; lacznie?: Przypomnienie }[]
  /** Ile kafelków czat obniżył (zmieniła się karta FSRS). */
  obnizone: number
  /** Nieudane dogrywki z rzędu po zapisie i limit. */
  dogrywek: number
  limit: number
  /** Limit przekroczony: przemapowanie tych kafelków (nazwy). */
  przemapowanie?: string[]
}

/** Wynik testu czatem (powtórka zero albo dobrowolna dogrywka po powtórce
 *  rozszerzonej).
 *
 *  1. Ocena łączna (tylko pierwszy test czatem powtórki zero): dla każdego
 *     kafelka gorsza z testu zakrytego i czatu — karta FSRS liczona raz, jako
 *     ocena z dnia testu. Częściowo/Nie → słaby; Nie → „do poprawy".
 *  2. Luki przypisane do kafelków → ich wymagania („z czatu: …").
 *  3. Bramka (powtórka zero): dalej dopiero przy ZALICZONE. Dogrywki nie
 *     zmieniają terminów. Po limicie nieudanych dogrywek: przemapowanie
 *     kafelków z NIE → przerwa → krótki test → znowu dogrywka.
 *  Sprzeciw („Nie zgadzam się") uchyla ocenę czatu kafelka i usuwa jego luki. */
export async function wynikCzatu(
  id: string,
  zaliczone: boolean,
  luki?: string,
  zCzatu?: { kafelki?: OcenaCzatu[]; klucz?: string },
): Promise<PoCzacie | undefined> {
  const kiedy = teraz()
  const iso = kiedy.toISOString()
  const kafelki = zCzatu?.kafelki ?? []
  const limit = wez('limitDogrywek')
  let wynik: PoCzacie | undefined
  const jPrzed = await db.nauka.get(id)
  if (!jPrzed) return undefined
  const klucze = await kluczePamieci(jPrzed)
  await db.transaction('rw', db.nauka, db.pamiec, db.historia, async () => {
    const j = await db.nauka.get(id)
    if (!j) return
    const zero = j.etap === 'czat'
    const dogrywka = !!j.luki
    const nazwa = new Map(kafelki.filter((k) => k.klucz).map((k) => [k.klucz!, k.nazwa]))

    // 1. ocena łączna — tylko pierwszy test czatem powtórki zero
    const zakryte: Record<string, Przypomnienie> = {}
    const lacznie: Record<string, Przypomnienie> = {}
    const opis: PoCzacie['kafelki'] = []
    let obnizone = 0
    for (const k of kafelki) {
      const pk = k.klucz ? klucze.get(k.klucz) : undefined
      const p = pk ? await db.pamiec.get(pk) : undefined
      const zak = p?.przed ? Z_RANGI[p.przed.ocena] : undefined
      const lacz = zak && liczySie(k) ? laczna(zak, ocenaPoCzacie(k)) : zak
      opis.push({ nazwa: k.nazwa, zakryta: zak, czat: k.ocena, twoja: k.twoja, lacznie: lacz })
      if (!zero || dogrywka || !p || !pk || !zak || !lacz) continue
      zakryte[pk] = zak
      lacznie[pk] = lacz
      if (!liczySie(k)) continue
      const o = RANGA[lacz]
      let zmiana: Partial<PamiecKafelka> = {}
      // obniżenie: karta jeszcze raz z oceną łączną, jak gdyby tamtego dnia
      if (o < p.przed!.ocena && p.karta.last_review === p.przed!.kiedy) {
        const karta = nastepna(p.przed!.karta, o, new Date(p.przed!.kiedy))
        zmiana = { karta, termin: karta.due, przed: { ...p.przed!, ocena: o } }
        obnizone++
      }
      if (lacz !== 'tak') zmiana.slaby = true
      if (Object.keys(zmiana).length) await db.pamiec.update(pk, { ...zmiana, zmieniono: iso })
    }

    // 2. luki → wymagania kafelków (twoje „Tak" usuwa luki kafelka)
    const lukiKafelkow = dopiszLuki(j.lukiKafelkow, kafelki)

    // „do poprawy": kafelki z NIE (po twoich zmianach)
    const nie = kafelki.filter((k) => liczySie(k) && ocenaPoCzacie(k) === 'nie').map((k) => k.klucz!)
    // luki do dogrywki: z podsumowania, a gdy ich nie ma — ze słabszych kafelków
    const lukiTekst =
      luki?.trim() ||
      kafelki
        .filter((k) => liczySie(k) && ocenaPoCzacie(k) !== 'tak')
        .map((k) => `- ${k.nazwa}: ${k.luki?.join('; ') || k.uwaga || 'do poprawy'}`)
        .join('\n') ||
      j.luki ||
      '- (czat nie wypisał luk)'

    const zmiany: Partial<JednostkaNauki> = { lukiKafelkow, zmieniono: iso }
    let dogrywek = j.dogrywek ?? 0
    if (zaliczone) {
      zmiany.luki = undefined
      zmiany.czatKafelki = undefined
      zmiany.kluczCzatu = undefined
      if (zero) {
        zmiany.etap = zadaniaWZero() ? 'zadania' : 'powtorki'
        zmiany.etapOd = iso
        zmiany.doPoprawy = undefined
        zmiany.dogrywek = undefined
        zmiany.dogrywekRazem = undefined
        zmiany.przemapowanie = undefined
        dogrywek = 0
      }
    } else {
      // kolejne podsumowanie zastępuje listę luk
      zmiany.luki = lukiTekst
      zmiany.czatKafelki = kafelki.length ? kafelki : j.czatKafelki
      zmiany.kluczCzatu = zCzatu?.klucz?.trim() || j.kluczCzatu
      if (zero) {
        zmiany.doPoprawy = nie.length ? nie : j.doPoprawy
        if (dogrywka) {
          dogrywek++
          zmiany.dogrywek = dogrywek
          zmiany.dogrywekRazem = (j.dogrywekRazem ?? 0) + 1
        }
      }
    }
    // limit nieudanych dogrywek: przemapowanie kafelków z NIE
    let przem: string[] | undefined
    if (zero && !zaliczone && dogrywek >= limit) {
      const doMapy = nie.length ? nie : (zmiany.doPoprawy ?? j.doPoprawy ?? [])
      if (doMapy.length) {
        zmiany.przemapowanie = {
          wezly: doMapy.filter((k) => !czyZadanie(k)),
          zadania: doMapy.filter(czyZadanie).map(idZadania),
          etap: 'mapowanie',
          od: iso,
        }
        przem = doMapy.map((k) => nazwa.get(k) ?? k)
      } else {
        // nie ma czego przemapować — licznik od zera
        zmiany.dogrywek = 0
        dogrywek = 0
      }
    }
    await db.nauka.update(id, zmiany)
    await db.historia.add({
      id: uid(),
      kiedy: iso,
      jednostkaId: id,
      typ: 'czat',
      czat: zaliczone ? 'zaliczone' : 'luki',
      luki: zaliczone ? undefined : lukiTekst,
      czatKafelki: kafelki.length ? kafelki : undefined,
      zakryte: Object.keys(zakryte).length ? zakryte : undefined,
      lacznie: Object.keys(lacznie).length ? lacznie : undefined,
      sprzeciwy: sprzeciwy(kafelki),
      dogrywka: dogrywka ? (j.dogrywekRazem ?? 0) + 1 : 0,
    })
    wynik = {
      zaliczone,
      dogrywka,
      etap: zmiany.etap ?? j.etap,
      kafelki: opis,
      obnizone,
      dogrywek,
      limit,
      przemapowanie: przem,
    }
  })
  return wynik
}

/** Bez czatu tym razem (np. bez internetu) — pominięcie nie jest darmowe:
 *  zostaje w historii, a najbliższa powtórka sektora będzie z czatem. */
export async function pominCzat(id: string) {
  const iso = teraz().toISOString()
  await db.transaction('rw', db.nauka, db.historia, async () => {
    await db.nauka.update(id, {
      etap: zadaniaWZero() ? 'zadania' : 'powtorki',
      etapOd: iso,
      luki: undefined,
      czatKafelki: undefined,
      kluczCzatu: undefined,
      doPoprawy: undefined,
      dogrywek: undefined,
      dogrywekRazem: undefined,
      przemapowanie: undefined,
      czatNastepnym: true,
      zmieniono: iso,
    })
    await db.historia.add({ id: uid(), kiedy: iso, jednostkaId: id, typ: 'czat', czat: 'pominiety' })
  })
}

/** Przemapowanie po limicie dogrywek: koniec mapowania → przerwa. */
export async function skonczPrzemapowanie(id: string) {
  const j = await db.nauka.get(id)
  if (!j?.przemapowanie) return
  await zmienJednostke(id, { przemapowanie: { ...j.przemapowanie, etap: 'przerwa', od: teraz().toISOString() } })
}

export function minutyPrzemapowania(j: JednostkaNauki, kiedy = teraz()): number {
  if (j.przemapowanie?.etap !== 'przerwa') return 0
  return (kiedy.getTime() - new Date(j.przemapowanie.od).getTime()) / 60000
}

export const przemapowanieOtwarte = (j: JednostkaNauki, kiedy = teraz()) =>
  j.przemapowanie?.etap === 'przerwa' && minutyPrzemapowania(j, kiedy) >= wez('przerwa')

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
  /** Powtórka zero w toku: mapowanie, przerwa, czat albo zadania. */
  wToku: JednostkaNauki[]
  /** Uparte kafelki (wiele wpadek). */
  uparte: { pamiec: PamiecKafelka; nazwa: string }[]
  minutyDzis: number
  minutyJutro: number
}

export async function planNauki(kiedy = teraz()): Promise<Plan> {
  const [jednostki, pamiecWszystko, sciezki, kafelki, t, znane] = await Promise.all([
    db.nauka.toArray(),
    db.pamiec.toArray(),
    db.paths.toArray(),
    db.concepts.toArray(),
    tempo(),
    znaneKlucze(),
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
    if (czyZadanie(k)) return nazwaKafelka.get(idZadania(k)) ?? '(usunięte zadanie)'
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
    if (j.etap === 'mapowanie' || j.etap === 'przerwa' || j.etap === 'czat' || j.etap === 'zadania') {
      wToku.push(j)
      continue
    }
    // douczanie nowych w toku — sektor ma przy tym swój zwykły termin
    if (j.douczanie) wToku.push(j)
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
    if (j.rodzaj === 'sektor' && p && !sektoryDzis.has(j.id) && !j.douczanie) {
      const nowe = noweWSektorze(j, p, pamiec, znane)
      for (const id of nowe.zadania) {
        const k = kluczZadania(id)
        dzisL.push({
          id: `nowy:${k}`,
          rodzaj: 'kafelek',
          klucz: k,
          nazwa: nazwaKlucza(k),
          gdzie: j.nazwa,
          minuty: t.pojedynczy,
          dni: 0,
          pamiec01: 0,
          nowy: true,
          jednostka: j,
        })
      }
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
    } else if (!nazwaKafelka.has(czyZadanie(pk.klucz) ? idZadania(pk.klucz) : pk.klucz)) continue
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
