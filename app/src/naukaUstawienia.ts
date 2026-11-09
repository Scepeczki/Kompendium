/** Ustawienia nauki i powtórek (Ustawienia → Nauka).
 *
 *  Wszystko, co jest liczbą do wyboru, siedzi w jednej tabeli: Ustawienia
 *  rysują z niej wiersze, a reszta programu czyta przez `wez`. Klucze mają
 *  przedrostek `ui.`, więc jadą razem z kopią zapasową. */

export interface UstawienieLiczby {
  klucz: string
  nazwa: string
  opis: string
  dom: number
  min: number
  max: number
  jednostka: string
}

const u = (
  klucz: string,
  nazwa: string,
  opis: string,
  dom: number,
  min: number,
  max: number,
  jednostka: string,
): UstawienieLiczby => ({ klucz: `ui.nauka.${klucz}`, nazwa, opis, dom, min, max, jednostka })

export const NAUKA = {
  cel: u(
    'cel',
    'Cel zapamiętania',
    'Szansa, że pamiętasz w chwili powtórki. Między powtórkami pamiętasz więcej (przy 95% średnio ok. 97%). Wyżej = częstsze powtórki.',
    95, 80, 97, '%',
  ),
  prog: u(
    'prog',
    'Próg obciążenia',
    'Ile minut powtórek dziennie to dla ciebie dość. Przy zaczynaniu nowego sektora ponad progiem aplikacja tylko uprzedza — nie blokuje. 0 = bez uprzedzania.',
    60, 0, 600, 'min',
  ),
  sektorOd: u('sektorOd', 'Sektor najmniej', 'Mniejszy sektor dostaje cichą uwagę.', 3, 1, 50, 'kafelków'),
  sektorDo: u('sektorDo', 'Sektor najwięcej', 'Większy sektor dostaje cichą uwagę, że lepiej go podzielić.', 12, 2, 100, 'kafelków'),
  przerwa: u('przerwa', 'Przerwa przed testem', 'Po mapowaniu test odblokowuje się dopiero po tylu minutach — zaraz po nauce wszystko jeszcze „siedzi" w głowie.', 20, 0, 180, 'min'),
  przypomnij: u('przypomnij', 'Przypomnienie o teście', 'Po tylu minutach od końca mapowania przychodzi powiadomienie.', 25, 0, 240, 'min'),
  rozszOd: u('rozszOd', 'Powtórka rozszerzona od', 'Od której powtórki może się zdarzyć rozszerzona (czat, zadania albo trudny tryb).', 3, 1, 20, '. powtórki'),
  rozszCo: u('rozszCo', 'Rozszerzona co', 'Co ile powtórek, póki terminy są bliskie.', 3, 1, 20, 'powtórki'),
  rozszDaleko: u('rozszDaleko', 'Dalekie terminy od', 'Gdy odstęp między powtórkami jest co najmniej taki…', 60, 1, 3650, 'dni'),
  rozszCoDaleko: u('rozszCoDaleko', 'Rozszerzona przy dalekich', '…rozszerzona wypada co tyle powtórek.', 2, 1, 20, 'powtórki'),
  zadanIle: u('zadanIle', 'Zadań z czatu', 'Ile zadań układa czat za jednym razem.', 3, 1, 10, 'zadań'),
  zadanWPowtorce: u('zadanWPowtorce', 'Zadań w powtórce', 'Ile zadań sektora wchodzi do powtórki rozszerzonej z zadaniami (za każdym razem następne).', 2, 1, 20, 'zadań'),
  uparty: u('uparty', 'Uparty kafelek po', 'Po tylu wpadkach kafelek dostaje radę „przemapuj go".', 4, 2, 30, 'wpadkach'),
  progDobrze: u('progDobrze', '„Dobrze" do', 'Jaki odsetek kafelków może nie pójść (Częściowo albo Nie), a sektor wciąż jest „Dobrze".', 20, 0, 100, '%'),
  progNie: u('progNie', '„Nie pamiętam" od', 'Powyżej takiego odsetka sektor jest „Nie pamiętam" i wraca do mapowania tych miejsc.', 50, 0, 100, '%'),
} as const

export type KluczNauki = keyof typeof NAUKA

export function wez(k: KluczNauki): number {
  const d = NAUKA[k]
  const raw = localStorage.getItem(d.klucz)
  if (raw === null) return d.dom
  const v = Number(raw)
  return Number.isFinite(v) && v >= d.min && v <= d.max ? v : d.dom
}

export function ustaw(k: KluczNauki, v: number): void {
  const d = NAUKA[k]
  const val = Math.min(d.max, Math.max(d.min, Math.round(v)))
  localStorage.setItem(d.klucz, String(val))
  window.dispatchEvent(new Event('komp:ui'))
}

export const PYTANIA_DOMYSLNE = [
  'Co przedstawia ta treść? Jaki jest jej sens?',
  'Jakie są kluczowe pojęcia i jak się ze sobą wiążą (struktura relacji)?',
  'Jaki jest zakres zastosowania i gdzie są granice?',
  'Po co to jest — co rozwiązuje?',
  'Dlaczego ma taką strukturę? Jakie jest jej uzasadnienie?',
  'Jaka jest metodyka i co z niej wynika?',
  'Jakie są konsekwencje definicji?',
  'Przykład i kontrprzykład; zastosowanie albo uogólnienie.',
  'Z czym to się łączy i gdzie leży w całości?',
].join('\n')

export const ZASADY_DOMYSLNE = [
  'Mapowanie jest bez schematu — pytania to wsparcie, nie formularz.',
  'Mapę rób z pewnego dystansu od źródła: najpierw z pamięci, potem sprawdź i popraw.',
  'Mapa to najprostsza możliwa forma przedstawienia sektora.',
  'Niektóre części mapowania wymagają źródła (pojęcia, zakres) — wtedy patrz do tekstu.',
  'Zaplanuj czas na całość: mapowanie, przerwę i test.',
].join('\n')

const KLUCZ_PYTANIA = 'ui.nauka.pytania'
const KLUCZ_ZASADY = 'ui.nauka.zasady'

const linie = (t: string) =>
  t
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

export const pytaniaTekst = () => localStorage.getItem(KLUCZ_PYTANIA) ?? PYTANIA_DOMYSLNE
export const zasadyTekst = () => localStorage.getItem(KLUCZ_ZASADY) ?? ZASADY_DOMYSLNE
export const pytania = () => linie(pytaniaTekst())
export const zasady = () => linie(zasadyTekst())

export function ustawPytania(t: string) {
  localStorage.setItem(KLUCZ_PYTANIA, t)
  window.dispatchEvent(new Event('komp:ui'))
}

export function ustawZasady(t: string) {
  localStorage.setItem(KLUCZ_ZASADY, t)
  window.dispatchEvent(new Event('komp:ui'))
}

/** Czy w powtórce zero po teście jest test czatem (Ustawienia → Nauka → Czat). */
export const czatWZero = () => localStorage.getItem('ui.nauka.czatWZero') !== '0'
export function ustawCzatWZero(v: boolean) {
  localStorage.setItem('ui.nauka.czatWZero', v ? '1' : '0')
  window.dispatchEvent(new Event('komp:ui'))
}

/** Czy w powtórce zero po czacie są zadania (opcjonalne — zawsze można je pominąć). */
export const zadaniaWZero = () => localStorage.getItem('ui.nauka.zadaniaWZero') !== '0'
export function ustawZadaniaWZero(v: boolean) {
  localStorage.setItem('ui.nauka.zadaniaWZero', v ? '1' : '0')
  window.dispatchEvent(new Event('komp:ui'))
}
