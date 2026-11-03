import { db } from './db'

/** Dłuższy bok po zmniejszeniu. Tyle wystarcza na pełną szerokość strony,
 *  a zdjęcie z telefonu nie waży wtedy kilku megabajtów. */
const MAKS_BOK = 1600
const JAKOSC = 0.85
const PRZEDROSTEK = 'obraz:'

export const SZEROKOSC_ZDJECIA_MIN = 5
export const SZEROKOSC_ZDJECIA_MAX = 100

export type PolozenieZdjecia = 'lewo' | 'srodek' | 'prawo' | 'oplyw-lewo' | 'oplyw-prawo' | 'wiersz'

/** Szerokość w procentach kolumny, żeby zdjęcie trzymało proporcje w każdym
 *  widoku i na telefonie. `null`: domyślna z Ustawień. */
export interface UkladZdjecia {
  szerokosc: number | null
  polozenie: PolozenieZdjecia
}

/** Układ jedzie w tytule obrazka, np. `![opis](obraz:id "zdjecie 40% oplyw-prawo")`:
 *  to zwykły Markdown, a kafelek bez układu nie zmienia się ani o znak. */
const TYTUL_UKLADU = /^zdjecie(?: (\d{1,3})%)?(?: (srodek|prawo|oplyw-lewo|oplyw-prawo|wiersz))?$/

export function czytajUklad(tytul?: string | null): UkladZdjecia {
  const m = TYTUL_UKLADU.exec(tytul ?? '')
  return {
    szerokosc: m?.[1] ? Number(m[1]) : null,
    polozenie: (m?.[2] ?? 'lewo') as PolozenieZdjecia,
  }
}

export function zapiszUklad({ szerokosc, polozenie }: UkladZdjecia): string | null {
  const czesci = [szerokosc !== null && `${szerokosc}%`, polozenie !== 'lewo' && polozenie]
  const tekst = czesci.filter(Boolean).join(' ')
  return tekst ? `zdjecie ${tekst}` : null
}

/** Treść renderuje się synchronicznie, więc zdjęcia trzymamy też w pamięci. */
const pamiec = new Map<string, string>()

export async function wczytajObrazy(): Promise<void> {
  for (const o of await db.obrazy.toArray()) pamiec.set(o.id, o.dane)
}

/** Adres do wyświetlenia dla `src` z treści. Inne adresy zostają bez zmian. */
export const adresObrazu = (src: string): string =>
  src.startsWith(PRZEDROSTEK) ? (pamiec.get(src.slice(PRZEDROSTEK.length)) ?? '') : src

async function zmniejsz(plik: Blob): Promise<string> {
  const obraz = await createImageBitmap(plik)
  const skala = Math.min(1, MAKS_BOK / Math.max(obraz.width, obraz.height))
  const plotno = document.createElement('canvas')
  plotno.width = Math.round(obraz.width * skala)
  plotno.height = Math.round(obraz.height * skala)
  plotno.getContext('2d')?.drawImage(obraz, 0, 0, plotno.width, plotno.height)
  obraz.close()
  return plotno.toDataURL('image/webp', JAKOSC)
}

/** Zapisuje zdjęcie i zwraca to, co ma trafić do `src` w treści. */
export async function dodajObraz(plik: Blob): Promise<string> {
  const o = { id: crypto.randomUUID(), dane: await zmniejsz(plik), dodano: new Date().toISOString() }
  await db.obrazy.add(o)
  pamiec.set(o.id, o.dane)
  return PRZEDROSTEK + o.id
}
