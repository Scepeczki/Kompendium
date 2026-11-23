import { db } from './db'
import { oznaczBezCofania } from './cofanie'

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
/** Wymiary zdjęć (szerokość, wysokość) — do zarezerwowania miejsca. */
const wymiary = new Map<string, { w: number; h: number }>()

export async function wczytajObrazy(): Promise<void> {
  for (const o of await db.obrazy.toArray()) {
    pamiec.set(o.id, o.dane)
    if (o.w && o.h) wymiary.set(o.id, { w: o.w, h: o.h })
  }
}

/** Wymiary zdjęcia z treści (`obraz:id`), jeśli są znane. */
export const wymiaryObrazu = (src: string) =>
  src.startsWith(PRZEDROSTEK) ? wymiary.get(src.slice(PRZEDROSTEK.length)) : undefined

/** Starsze zdjęcia nie mają zapisanych wymiarów — dostają je przy pierwszym
 *  wyświetleniu (gdziekolwiek). Następnym razem miejsce jest już zarezerwowane. */
if (typeof document !== 'undefined') {
  document.addEventListener(
    'load',
    (e) => {
      const img = e.target as HTMLImageElement | null
      if (!(img instanceof HTMLImageElement)) return
      const src = img.dataset.obraz
      if (!src?.startsWith(PRZEDROSTEK) || !img.naturalWidth || !img.naturalHeight) return
      const id = src.slice(PRZEDROSTEK.length)
      if (wymiary.has(id)) return
      const w = { w: img.naturalWidth, h: img.naturalHeight }
      wymiary.set(id, w)
      void db
        .transaction('rw', db.obrazy, async () => {
          // uzupełnienie wymiarów to nie działanie użytkownika — poza cofaniem
          oznaczBezCofania()
          await db.obrazy.update(id, w)
        })
        .catch(() => {})
    },
    true,
  )
}

/** Adres do wyświetlenia dla `src` z treści. Inne adresy zostają bez zmian. */
export const adresObrazu = (src: string): string =>
  src.startsWith(PRZEDROSTEK) ? (pamiec.get(src.slice(PRZEDROSTEK.length)) ?? '') : src

async function zmniejsz(plik: Blob): Promise<{ dane: string; w: number; h: number }> {
  const obraz = await createImageBitmap(plik)
  const skala = Math.min(1, MAKS_BOK / Math.max(obraz.width, obraz.height))
  const plotno = document.createElement('canvas')
  plotno.width = Math.round(obraz.width * skala)
  plotno.height = Math.round(obraz.height * skala)
  plotno.getContext('2d')?.drawImage(obraz, 0, 0, plotno.width, plotno.height)
  obraz.close()
  return { dane: plotno.toDataURL('image/webp', JAKOSC), w: plotno.width, h: plotno.height }
}

/** Zapisuje zdjęcie i zwraca to, co ma trafić do `src` w treści. */
export async function dodajObraz(plik: Blob): Promise<string> {
  const o = { id: crypto.randomUUID(), ...(await zmniejsz(plik)), dodano: new Date().toISOString() }
  await db.obrazy.add(o)
  pamiec.set(o.id, o.dane)
  wymiary.set(o.id, { w: o.w, h: o.h })
  return PRZEDROSTEK + o.id
}
