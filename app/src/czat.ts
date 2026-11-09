/** Test czatem — bez kosztów i bez klucza: aplikacja składa polecenie razem
 *  z treścią sektora, kopiuje je do schowka i otwiera czat w nowej karcie.
 *  Ty tylko wklejasz.
 *
 *  Czat ma być EGZAMINATOREM, nie nauczycielem: pyta po jednym, nie
 *  podpowiada, nie cytuje materiału, a na końcu wypisuje werdykt i luki.
 *  (Badanie Bastani i in. 2025: czat bez takich zasad pomagał w ćwiczeniach,
 *  a szkodził na samodzielnym teście.) */

import { db, mainPageName } from './db'
import { ocenialny, wezlySektora, type NoweZadanie } from './nauka'
import { pytania, wez } from './naukaUstawienia'
export { czatWZero, ustawCzatWZero } from './naukaUstawienia'
import { kluczWlasnej, type JednostkaNauki, type PathNode } from './types'

// ---------------------------------------------------------------------------
// Ustawienia

export const CZATY = [
  { id: 'gemini', nazwa: 'Gemini', adres: 'https://gemini.google.com/app' },
  { id: 'chatgpt', nazwa: 'ChatGPT', adres: 'https://chatgpt.com/' },
  { id: 'claude', nazwa: 'Claude', adres: 'https://claude.ai/new' },
] as const

const K = {
  czat: 'ui.nauka.czat',
  wlasny: 'ui.nauka.czatAdres',
  test: 'ui.nauka.polecenieTest',
  dogrywka: 'ui.nauka.polecenieDogrywka',
  sprawdz: 'ui.nauka.polecenieSprawdz',
  zadania: 'ui.nauka.polecenieZadania',
  tryb: 'ui.nauka.czatTryb',
  eksperyment: 'ui.nauka.eksperyment',
}

const zmiana = () => window.dispatchEvent(new Event('komp:ui'))

/** Który czat: gemini / chatgpt / claude / wlasny. */
export const czatWybrany = () => localStorage.getItem(K.czat) ?? 'gemini'
export const czatWlasnyAdres = () => localStorage.getItem(K.wlasny) ?? ''
export function ustawCzat(id: string, wlasny?: string) {
  localStorage.setItem(K.czat, id)
  if (wlasny !== undefined) localStorage.setItem(K.wlasny, wlasny)
  zmiana()
}
export function adresCzatu(): string {
  const id = czatWybrany()
  if (id === 'wlasny') return czatWlasnyAdres() || CZATY[0].adres
  return CZATY.find((c) => c.id === id)?.adres ?? CZATY[0].adres
}


/** W powtórkach rozszerzonych: słabsza mieszanka wszystkich technik albo
 *  jedna technika naraz (na zmianę). */
export type TrybCzatu = 'mieszanka' | 'jedna'
export const trybCzatu = (): TrybCzatu => (localStorage.getItem(K.tryb) === 'jedna' ? 'jedna' : 'mieszanka')
export const ustawTrybCzatu = (t: TrybCzatu) => {
  localStorage.setItem(K.tryb, t)
  zmiana()
}

/** Eksperyment „czat sprawdza moje odpowiedzi". */
export const eksperyment = () => localStorage.getItem(K.eksperyment) !== '0'
export const ustawEksperyment = (v: boolean) => {
  localStorage.setItem(K.eksperyment, v ? '1' : '0')
  zmiana()
}

export const TECHNIKI = [
  'Technika Feynmana — zachowuj się jak laik i dopytuj „dlaczego?", aż wyjaśnię do końca.',
  'Przewidywanie zmian — zmień jedno założenie albo parametr i każ mi przewidzieć skutek.',
  'Wykrywanie błędów — podaj wyjaśnienie albo rozwiązanie z celowo wstawionym błędem i każ mi go znaleźć.',
  'Kompresja — każ mi ująć sedno w jednym zdaniu, potem w jednym akapicie, a potem wróć do szczegółów.',
]

export const POLECENIE_TEST = `Jesteś egzaminatorem. Sprawdzasz, czy naprawdę rozumiem i pamiętam materiał podany na końcu. Materiał jest jedynym źródłem prawdy — nie poprawiaj go wiedzą spoza niego; jeśli coś w nim wydaje ci się błędne, napisz o tym osobno na samym końcu.

Zasady:
- Zadawaj JEDNO pytanie naraz i czekaj na moją odpowiedź.
- Nie podpowiadaj, nie cytuj materiału i nie zdradzaj odpowiedzi, zanim nie odpowiem.
- Po mojej odpowiedzi powiedz krótko, co było dobrze, czego brakowało i co było błędne — dopiero potem zadaj następne pytanie.
- Pisz po polsku, wzory w LaTeX-u.

Sposoby sprawdzania:
{TECHNIKI}

Sprawdź przede wszystkim, czy umiem odpowiedzieć na te pytania:
{PYTANIA}

Zadaj około {ILE} pytań i zakończ.

Na końcu wypisz dokładnie w tej postaci:
WYNIK: ZALICZONE albo NIEZALICZONE
LUKI:
- każdy konkretny brak albo błąd w osobnej linii

Materiał — sektor „{NAZWA}":

{MATERIAL}`

export const POLECENIE_DOGRYWKA = `Jesteś egzaminatorem. W poprzednim teście z materiału podanego na końcu wyszły mi luki (lista niżej). Poprawiłem je — sprawdź TYLKO te luki.

Zasady:
- Jedno pytanie naraz; czekaj na moją odpowiedź.
- Nie podpowiadaj, nie cytuj materiału, nie zdradzaj odpowiedzi.
- Po odpowiedzi krótko: co dobrze, czego brakowało, co błędne.
- Materiał jest jedynym źródłem prawdy. Pisz po polsku, wzory w LaTeX-u.

Luki do sprawdzenia:
{LUKI}

Na końcu wypisz dokładnie w tej postaci:
WYNIK: ZALICZONE albo NIEZALICZONE
LUKI:
- to, co nadal nie siedzi (każde w osobnej linii)

Materiał — sektor „{NAZWA}":

{MATERIAL}`

export const POLECENIE_SPRAWDZ = `Porównaj to, co odtworzyłem z pamięci, z materiałem podanym na końcu. Materiał jest jedynym źródłem prawdy.

Dla każdego kafelka (i dla mapy) napisz krótko:
- czego brakuje,
- co jest błędne,
- czy to raczej Tak / Częściowo / Nie.
Nie przepisuj materiału i nie dopisuj wiedzy spoza niego. Pisz po polsku.

Co odtworzyłem z pamięci:

{ODPOWIEDZI}

Materiał — sektor „{NAZWA}":

{MATERIAL}`

/** Zadania: liczenie nie jest celem — chodzi o METODĘ, którą da się potem
 *  odtworzyć z pamięci. Stały format odpowiedzi pozwala pociąć ją na
 *  kafelki-zadania bez ręcznego przepisywania. */
export const POLECENIE_ZADANIA = `Ułóż {ILE} zadań do materiału podanego na końcu (sektor „{NAZWA}"). Materiał jest jedynym źródłem prawdy.

Zadania mają sprawdzać ZROZUMIENIE i METODĘ, a nie sprawność rachunkową: jak podejść do problemu, którego pojęcia albo twierdzenia użyć i dlaczego, na co uważać. Różne typy: zastosowanie, przykład albo kontrprzykład, „co się zmieni, gdy…", znalezienie błędu w rozumowaniu. Zadania niech nie powtarzają tego, co już jest w sekcji „Zadania" materiału.

Odpowiedz WYŁĄCZNIE w tym formacie, bez wstępu i zakończenia, każde zadanie tak samo:

=== ZADANIE: krótki tytuł
TREŚĆ:
treść zadania
ROZWIĄZANIE:
pełne rozwiązanie
METODA:
metoda w kilku krokach — od czego zacząć, jaki jest pomysł, dlaczego działa; tak, żeby dało się ją odtworzyć z pamięci przy podobnym zadaniu

Pisz po polsku, wzory w LaTeX-u ($…$).

Materiał — sektor „{NAZWA}":

{MATERIAL}`

export type RodzajPolecenia = 'test' | 'dogrywka' | 'sprawdz' | 'zadania'
const KLUCZ_POLECENIA: Record<RodzajPolecenia, string> = {
  test: K.test,
  dogrywka: K.dogrywka,
  sprawdz: K.sprawdz,
  zadania: K.zadania,
}
export const DOMYSLNE: Record<RodzajPolecenia, string> = {
  test: POLECENIE_TEST,
  dogrywka: POLECENIE_DOGRYWKA,
  sprawdz: POLECENIE_SPRAWDZ,
  zadania: POLECENIE_ZADANIA,
}
export const polecenie = (r: RodzajPolecenia) => localStorage.getItem(KLUCZ_POLECENIA[r]) ?? DOMYSLNE[r]
export const ustawPolecenie = (r: RodzajPolecenia, t: string) => {
  localStorage.setItem(KLUCZ_POLECENIA[r], t)
  zmiana()
}

// ---------------------------------------------------------------------------
// Materiał sektora jako tekst

/** Zdjęć przez schowek nie przekażemy — czat dostaje ich opis. */
const bezZdjec = (md: string) =>
  md.replace(/!\[([^\]]*)\]\((?:obraz:|data:)[^)]*\)/g, (_, opis: string) => `[rysunek${opis ? `: ${opis}` : ''}]`)

/** Cały sektor jako jeden tekst: kafelki w kolejności Linii (z ich stronami,
 *  tak jak stoją w ścieżce), notatki i rozdziały jako tło, na końcu mapa. */
export async function materialSektora(j: JednostkaNauki): Promise<string> {
  const sciezka = j.pathId ? await db.paths.get(j.pathId) : undefined
  const wezly: PathNode[] =
    j.rodzaj === 'sektor'
      ? wezlySektora(j, sciezka)
      : sciezka?.nodes.filter((n) => n.id === j.nodeId) ?? []
  const czesci: string[] = []
  const typy = new Map((await db.blockTypes.toArray()).map((t) => [t.id, t.label]))

  const kafelek = async (conceptId: string, n?: PathNode) => {
    const c = await db.concepts.get(conceptId)
    if (!c) return
    const wersje = await db.versions.where('conceptId').equals(conceptId).toArray()
    const versionId = n?.kind === 'block' ? n.versionId : null
    const v = wersje.find((x) => x.id === versionId) ?? wersje.find((x) => x.id === c.currentVersionId)
    if (!v) return
    const wlasne = n?.kind === 'block' ? n.wlasneTresci : undefined
    const nazwa = (n?.kind === 'block' ? n.nazwa : undefined) ?? c.name
    const strony = (await db.subpages.where('[conceptId+versionId]').equals([c.id, v.id]).sortBy('order')) ?? []
    let t = `### ${typy.get(c.type) ?? c.type}: ${nazwa}\n\n${wlasne?.[kluczWlasnej(v.id, null)] ?? v.content}`
    for (const s of strony) {
      t += `\n\n#### ${s.name}\n\n${wlasne?.[kluczWlasnej(v.id, s.id)] ?? s.content}`
    }
    if (strony.length) t = t.replace(/^(### [^\n]+\n\n)/, `$1(${mainPageName(c)})\n\n`)
    czesci.push(t)
  }

  if (j.rodzaj === 'fiszka' && j.conceptId && !wezly.length) {
    await kafelek(j.conceptId)
  }
  for (const n of wezly) {
    if (n.kind === 'heading') czesci.push(`## ${n.text}`)
    else if (n.kind === 'text') czesci.push(`(Notatka)\n\n${n.text}`)
    else if (n.kind === 'block') await kafelek(n.conceptId, n)
    else if (n.kind === 'fusion') {
      let t = `### ${n.type ? (typy.get(n.type) ?? n.type) : 'Blok'}: ${n.name || 'Grupa'}\n\n`
      if (n.content !== undefined) t += n.content
      else {
        for (const p of n.parts) {
          const v = await db.versions.get(p.versionId ?? (await db.concepts.get(p.conceptId))?.currentVersionId ?? '')
          if (v) t += `${p.wlasneTresci?.[kluczWlasnej(v.id, null)] ?? v.content}\n\n`
        }
      }
      for (const s of n.strony ?? []) t += `\n\n#### ${s.name}\n\n${s.content}`
      czesci.push(t)
    }
  }
  // zadania z rozwiązaniem i metodą też są treścią sektora
  if (j.rodzaj === 'sektor' && j.zadania?.length) {
    czesci.push('## Zadania')
    for (const id of j.zadania) await kafelek(id)
  }
  if (j.mapa?.trim()) czesci.push(`### Mapa sektora\n\n${j.mapa}`)
  return bezZdjec(czesci.join('\n\n---\n\n'))
}

/** Ile kafelków ma sektor — do „około N pytań". */
export async function ileOcenialnych(j: JednostkaNauki): Promise<number> {
  const s = j.pathId ? await db.paths.get(j.pathId) : undefined
  return wezlySektora(j, s).filter(ocenialny).length
}

// ---------------------------------------------------------------------------
// Składanie polecenia

export interface Parametry {
  rodzaj: RodzajPolecenia
  /** Pełny test (powtórka zero) albo krótszy (powtórka rozszerzona). */
  krotki?: boolean
  /** Która technika, gdy w powtórkach jedna naraz (indeks w TECHNIKI). */
  technika?: number
  luki?: string
  odpowiedzi?: string
}

export async function zlozPolecenie(j: JednostkaNauki, p: Parametry): Promise<string> {
  const material = await materialSektora(j)
  const n = await ileOcenialnych(j)
  const jedna = p.krotki && trybCzatu() === 'jedna'
  const techniki = jedna ? [TECHNIKI[(p.technika ?? 0) % TECHNIKI.length]] : TECHNIKI
  const ile =
    p.rodzaj === 'zadania'
      ? wez('zadanIle')
      : p.krotki
        ? Math.max(3, Math.min(6, n))
        : Math.max(5, Math.min(12, n + 3))
  return polecenie(p.rodzaj)
    .replaceAll('{NAZWA}', j.nazwa)
    .replaceAll('{MATERIAL}', material)
    .replaceAll('{PYTANIA}', pytania().map((x) => `- ${x}`).join('\n'))
    .replaceAll('{TECHNIKI}', techniki.map((x) => `- ${x}`).join('\n'))
    .replaceAll('{ILE}', String(ile))
    .replaceAll('{LUKI}', p.luki?.trim() || '(brak listy)')
    .replaceAll('{ODPOWIEDZI}', p.odpowiedzi?.trim() || '(nic nie napisałem)')
}

/** Kopiuje polecenie i otwiera czat w nowej karcie. Wypełnianie czatu przez
 *  sam adres działa niepewnie (i długi tekst się w nim nie mieści), więc
 *  idziemy przez schowek. */
export async function otworzCzat(tekst: string): Promise<boolean> {
  let skopiowano = false
  try {
    await navigator.clipboard.writeText(tekst)
    skopiowano = true
  } catch {
    // bez dostępu do schowka — tekst i tak pokażemy do ręcznego skopiowania
  }
  window.open(adresCzatu(), '_blank', 'noopener')
  window.dispatchEvent(
    new CustomEvent('komp:komunikat', {
      detail: skopiowano
        ? 'Polecenie w schowku — w czacie wklej je (Ctrl+V) i wyślij'
        : 'Nie udało się skopiować — skopiuj polecenie ręcznie z okienka',
    }),
  )
  return skopiowano
}

/** Wyciąga z odpowiedzi czatu wynik i luki (jeśli wklejono całość). */
export function czytajWynik(tekst: string): { zaliczone?: boolean; luki: string } {
  const w = /WYNIK:\s*(NIE)?ZALICZONE/i.exec(tekst)
  const i = tekst.search(/LUKI:/i)
  const luki = i >= 0 ? tekst.slice(i + 5).trim() : tekst.trim()
  return { zaliczone: w ? !w[1] : undefined, luki }
}

/** Tnie odpowiedź czatu na zadania. Znosi to, co czaty robią z formatem:
 *  pogrubienia, nagłówki Markdown, „Zadanie 1:" zamiast „=== ZADANIE:". */
export function podzielZadania(tekst: string): NoweZadanie[] {
  const linie = tekst.replace(/\r\n/g, '\n').split('\n')
  const czysc = (l: string) => l.replace(/^[\s>#*_=-]+/, '').replace(/[*_]+/g, '').trim()
  const naglowek = /^(?:zadanie)\b\s*(?:nr\.?\s*)?\d*\s*[:.)-]?\s*(.*)$/i
  const pole = /^(treść|tresc|rozwiązanie|rozwiazanie|metoda)\s*:?\s*(.*)$/i
  const out: NoweZadanie[] = []
  let biez: NoweZadanie | null = null
  let gdzie: 'tresc' | 'rozwiazanie' | 'metoda' | null = null
  const dopisz = (t: string) => {
    if (!biez || !gdzie) return
    biez[gdzie] = biez[gdzie] === undefined ? t : `${biez[gdzie]}\n${t}`
  }
  for (const surowa of linie) {
    const c = czysc(surowa)
    const n = naglowek.exec(c)
    // „Zadanie" jako nagłówek tylko wtedy, gdy linia była wyróżniona albo krótka —
    // zdanie „Zadanie polega na…" w treści nie zaczyna nowego zadania
    const wyrozniona = /^[\s>#*_=-]/.test(surowa) || c.length < 60
    if (n && wyrozniona && !pole.test(c)) {
      biez = { nazwa: n[1].replace(/^[:.)-]\s*/, '').trim() || undefined }
      out.push(biez)
      gdzie = null
      continue
    }
    const p = pole.exec(c)
    if (p && biez && /^[\s>#*_=-]*\**\s*(treść|tresc|rozwiązanie|rozwiazanie|metoda)/i.test(surowa)) {
      const k = p[1].toLowerCase()
      gdzie = k.startsWith('tre') ? 'tresc' : k.startsWith('roz') ? 'rozwiazanie' : 'metoda'
      if (p[2]) dopisz(p[2])
      else biez[gdzie] = biez[gdzie] ?? ''
      continue
    }
    dopisz(surowa)
  }
  return out
    .map((z) => ({
      nazwa: z.nazwa,
      tresc: z.tresc?.trim(),
      rozwiazanie: z.rozwiazanie?.trim(),
      metoda: z.metoda?.trim(),
    }))
    .filter((z) => z.tresc || z.rozwiazanie || z.metoda)
}
