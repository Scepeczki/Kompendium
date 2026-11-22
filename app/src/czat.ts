/** Test czatem — bez kosztów i bez klucza: aplikacja składa polecenie razem
 *  z treścią sektora, kopiuje je do schowka i otwiera czat w nowej karcie.
 *  Ty tylko wklejasz.
 *
 *  Czat ma być EGZAMINATOREM, nie nauczycielem: pyta po jednym, nie
 *  podpowiada, nie cytuje materiału, a na końcu wypisuje werdykt i luki.
 *  (Badanie Bastani i in. 2025: czat bez takich zasad pomagał w ćwiczeniach,
 *  a szkodził na samodzielnym teście.) */

import { db, mainPageName } from './db'
import { ocenialny, wezlySektora } from './nauka'
import { pytania } from './naukaUstawienia'
import { otworzAdres } from './pulpit'
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

/** Jak czat ma podsumować test — wzór, zasady i przykład. Program odczytuje
 *  to podsumowanie sam (czytajWynik), więc postać musi być ściśle ustalona. */
const ZASADY_PODSUMOWANIA = `Zasady podsumowania:
- Całe podsumowanie podaj w JEDNYM bloku kodu (trzy znaki \` na początku i na końcu), bez żadnego innego tekstu w środku.
- Sekcje zawsze w tej kolejności i z tymi nazwami: WYNIK, KAFELKI, LUKI, KLUCZ — każda nazwa w osobnej linii, zakończona dwukropkiem.
- WYNIK: jedno słowo — ZALICZONE albo NIEZALICZONE. ZALICZONE tylko wtedy, gdy żaden kafelek nie ma oceny NIE.
- KAFELKI: jedna linia na kafelek, w kolejności z materiału: „- Nazwa: OCENA — jedno zdanie". Nazwę przepisz dokładnie z nagłówka „###", ale bez rodzaju przed dwukropkiem (z „### Definicja: Kula" piszesz „Kula"). OCENA wielkimi literami: TAK, CZĘŚCIOWO, NIE albo NIESPRAWDZONY.
- NIESPRAWDZONY: kafelek, o który nie padło żadne pytanie. Nie zgaduj oceny — wpisz NIESPRAWDZONY i jako zdanie „nie było pytania".
- LUKI: każdy konkretny brak albo błąd w osobnej linii: „- Nazwa kafelka: brak albo błąd". Luka zawsze należy do kafelka z oceną CZĘŚCIOWO albo NIE (nazwa jak w KAFELKI). Gdy luk nie ma, napisz „- brak".
- KLUCZ: tylko kafelki z oceną CZĘŚCIOWO albo NIE: „- Nazwa: wzorcowa odpowiedź w 2–4 zdaniach", wyłącznie na podstawie materiału. Gdy takich kafelków nie ma, napisz „- brak".
- Bez pogrubień, numeracji i dodatkowych sekcji.`

const PRZYKLAD_PODSUMOWANIA = `Przykład (sektor z czterema kafelkami: „### Definicja: Kula", „### Definicja: Otoczenie", „### Definicja: Zbiór domknięty", „### Twierdzenie: Lemat o kulach"):
\`\`\`
WYNIK: NIEZALICZONE
KAFELKI:
- Kula: TAK — poprawna definicja i dobry przykład.
- Otoczenie: CZĘŚCIOWO — definicja dobra, ale bez przykładu.
- Zbiór domknięty: NIE — pomylony ze zbiorem otwartym.
- Lemat o kulach: NIESPRAWDZONY — nie było pytania.
LUKI:
- Otoczenie: brak przykładu otoczenia punktu
- Zbiór domknięty: opisany jak zbiór otwarty
KLUCZ:
- Otoczenie: Otoczenie punktu x to każdy zbiór zawierający kulę o środku w x. Na przykład przedział (0, 2) jest otoczeniem punktu 1.
- Zbiór domknięty: Zbiór jest domknięty, gdy jego dopełnienie jest otwarte. Równoważnie: zawiera wszystkie swoje punkty skupienia.
\`\`\``

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

Po ostatnim pytaniu wypisz KAŻDY kafelek z materiału (każdy nagłówek „###", zadania też). Oceń tylko te, o które padło pytanie; pozostałe oznacz NIESPRAWDZONY. Napisz podsumowanie według wzoru:
\`\`\`
WYNIK: ZALICZONE albo NIEZALICZONE
KAFELKI:
- Nazwa kafelka: TAK albo CZĘŚCIOWO albo NIE albo NIESPRAWDZONY — jedno zdanie, co było dobrze albo czego brakowało
LUKI:
- Nazwa kafelka: jeden konkretny brak albo błąd
KLUCZ:
- Nazwa kafelka: wzorcowa odpowiedź w 2–4 zdaniach
\`\`\`

${ZASADY_PODSUMOWANIA}

${PRZYKLAD_PODSUMOWANIA}

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

Po ostatnim pytaniu oceń kafelki, których dotyczyły luki (tylko je), i napisz podsumowanie według wzoru:
\`\`\`
WYNIK: ZALICZONE albo NIEZALICZONE
KAFELKI:
- Nazwa kafelka: TAK albo CZĘŚCIOWO albo NIE — jedno zdanie, co już siedzi albo czego nadal brakuje
LUKI:
- Nazwa kafelka: to, co nadal nie siedzi
KLUCZ:
- Nazwa kafelka: wzorcowa odpowiedź w 2–4 zdaniach
\`\`\`

${ZASADY_PODSUMOWANIA}

${PRZYKLAD_PODSUMOWANIA}

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

export type RodzajPolecenia = 'test' | 'dogrywka' | 'sprawdz'
const KLUCZ_POLECENIA: Record<RodzajPolecenia, string> = {
  test: K.test,
  dogrywka: K.dogrywka,
  sprawdz: K.sprawdz,
}
export const DOMYSLNE: Record<RodzajPolecenia, string> = {
  test: POLECENIE_TEST,
  dogrywka: POLECENIE_DOGRYWKA,
  sprawdz: POLECENIE_SPRAWDZ,
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
    // wymagania z mapowania: co ma być w odpowiedzi o tym kafelku
    const kl = n ? n.id : `zadanie:${conceptId}`
    const wym = [j.wymagania?.[kl]?.trim(), ...(j.lukiKafelkow?.[kl] ?? []).map((l) => `z czatu: ${l}`)]
      .filter(Boolean)
      .join('; ')
    if (wym) t = t.replace(/^(### [^\n]+\n\n)/, `$1(Wymagania w teście: ${wym})\n\n`)
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
  const ile = p.krotki ? Math.max(3, Math.min(6, n)) : Math.max(5, Math.min(12, n + 3))
  return polecenie(p.rodzaj)
    .replaceAll('{NAZWA}', j.nazwa)
    .replaceAll('{MATERIAL}', material)
    .replaceAll('{PYTANIA}', pytania().map((x) => `- ${x}`).join('\n'))
    .replaceAll('{TECHNIKI}', techniki.map((x) => `- ${x}`).join('\n'))
    .replaceAll('{ILE}', String(ile))
    .replaceAll('{LUKI}', p.luki?.trim() || '(brak listy)')
    .replaceAll('{ODPOWIEDZI}', p.odpowiedzi?.trim() || '(nic nie napisałem)')
}

/** Kopiuje polecenie do schowka (bez otwierania czatu). */
export async function kopiujPolecenie(tekst: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(tekst)
    window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: 'Polecenie w schowku' }))
    return true
  } catch {
    window.dispatchEvent(
      new CustomEvent('komp:komunikat', { detail: 'Nie udało się skopiować — skopiuj polecenie ręcznie z okienka' }),
    )
    return false
  }
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
  void otworzAdres(adresCzatu())
  window.dispatchEvent(
    new CustomEvent('komp:komunikat', {
      detail: skopiowano
        ? 'Polecenie w schowku — w czacie wklej je (Ctrl+V) i wyślij'
        : 'Nie udało się skopiować — skopiuj polecenie ręcznie z okienka',
    }),
  )
  return skopiowano
}

/** Sekcja odpowiedzi czatu: od „NAZWA:" do następnej sekcji albo końca. */
function sekcja(tekst: string, nazwa: string): string | undefined {
  const m = new RegExp(`^[ \\t>#*]*${nazwa}\\**:[ \\t]*`, 'im').exec(tekst)
  if (!m) return undefined
  const reszta = tekst.slice(m.index + m[0].length)
  const kolejna = /^[ \t>#*]*(WYNIK|KAFELKI|LUKI|KLUCZ)\**:/im.exec(reszta)
  return (kolejna ? reszta.slice(0, kolejna.index) : reszta).trim()
}

export type OcenaKafelkaCzatu = 'tak' | 'czesciowo' | 'nie' | 'niesprawdzony'
const OCENA_CZATU: Record<string, OcenaKafelkaCzatu> = {
  tak: 'tak',
  częściowo: 'czesciowo',
  czesciowo: 'czesciowo',
  nie: 'nie',
  niesprawdzony: 'niesprawdzony',
  niesprawdzone: 'niesprawdzony',
}

export interface WynikCzatu {
  zaliczone?: boolean
  luki: string
  kafelki: { nazwa: string; ocena: OcenaKafelkaCzatu; uwaga?: string; luki?: string[] }[]
  klucz?: string
}

const normNazwy = (s: string) =>
  s.toLowerCase().replace(/[„”"'«»*_`]/g, '').replace(/\s+/g, ' ').trim()

/** Czy podsumowanie przechodzi: bez kafelków — według WYNIK; z kafelkami —
 *  gdy żaden nie ma NIE (twoja ocena zastępuje ocenę czatu). Bez WYNIK i bez
 *  kafelków (wklejone same luki) — nie przechodzi. */
export function czyZaliczone(w: {
  zaliczone?: boolean
  kafelki: { ocena: OcenaKafelkaCzatu; twoja?: 'tak' | 'czesciowo' | 'nie' }[]
}): boolean {
  if (w.kafelki.length) return !w.kafelki.some((k) => (k.twoja ?? k.ocena) === 'nie')
  return w.zaliczone === true
}

/** Wyciąga z odpowiedzi czatu wynik, ocenę kafelków, luki i klucz odpowiedzi
 *  (jeśli wklejono całość). Bez żadnej sekcji cały tekst to luki. */
export function czytajWynik(wklejone: string): WynikCzatu {
  // czat podaje podsumowanie w bloku kodu — znaczniki ``` nie są treścią
  const tekst = wklejone.replace(/^[ \t]*```.*$/gm, '')
  const pusta = (s: string | undefined) => (s && !/^[-•*\s]*brak\.?\s*$/i.test(s) ? s : undefined)
  const w =/WYNIK:\s*\**\s*(NIE)?ZALICZONE/i.exec(tekst)
  const sekcjaLuk = sekcja(tekst, 'LUKI')
  const luki =
    sekcjaLuk !== undefined ? (pusta(sekcjaLuk) ?? '') : /(KAFELKI|KLUCZ):/i.test(tekst) ? '' : tekst.trim()
  const kafelki: WynikCzatu['kafelki'] = []
  for (const linia of (sekcja(tekst, 'KAFELKI') ?? '').split('\n')) {
    const m =
      /^\s*[-*•]\s*\**(.+?)\**\s*[:–—]\s*\**(TAK|CZĘŚCIOWO|CZESCIOWO|NIESPRAWDZONY|NIESPRAWDZONE|NIE)\b\**\s*[—–:-]?\s*(.*)$/i.exec(
        linia,
      )
    if (m) kafelki.push({ nazwa: m[1].trim(), ocena: OCENA_CZATU[m[2].toLowerCase()], uwaga: m[3].trim() || undefined })
  }
  // luki „- Nazwa kafelka: brak" — przypisane do kafelka o tej nazwie
  for (const linia of luki.split('\n')) {
    const m = /^\s*[-*•]\s*\**(.+?)\**\s*:\s*(.+)$/.exec(linia)
    if (!m) continue
    const n = normNazwy(m[1])
    const k = kafelki.find((x) => normNazwy(x.nazwa) === n)
    if (k) (k.luki ??= []).push(m[2].trim())
  }
  return { zaliczone: w ? !w[1] : undefined, luki, kafelki, klucz: pusta(sekcja(tekst, 'KLUCZ')) }
}

