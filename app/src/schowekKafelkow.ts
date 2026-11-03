import { db, duplicateConcept } from './db'

/** Kopiowanie kafelków Ctrl+C / Ctrl+V.
 *
 *  Do schowka systemu idzie zwykły tekst — wklejony poza Kompendium jest
 *  czytelną notatką z wersjami i stronami. Sam program rozpoznaje go po
 *  treści: pamiętamy, jaki tekst wysłaliśmy i których kafelków dotyczył.
 *  Pamięć leży w przeglądarce, więc działa też w drugiej karcie i po
 *  odświeżeniu. */

const KLUCZ = 'schowek.kafelki'

interface Zapis {
  tekst: string
  ids: string[]
}

const naglowek = (poziom: number, tekst: string) => `${'#'.repeat(poziom)} ${tekst}`

/** Tekst kafelków: nazwa i rodzaj, treść bieżącej wersji z jej stronami,
 *  a niżej starsze i inne wersje, każda ze swoimi stronami. */
export async function tekstKafelkow(
  ids: string[],
  rodzaj: (typeId: string) => string,
): Promise<string> {
  const czesci: string[] = []
  for (const id of ids) {
    const c = await db.concepts.get(id)
    if (!c) continue
    const wersje = (await db.versions.where('conceptId').equals(id).toArray()).sort(
      (a, b) => a.version - b.version,
    )
    const strony = await db.subpages.where('conceptId').equals(id).toArray()
    const stronyWersji = (versionId: string) =>
      strony.filter((s) => s.versionId === versionId).sort((a, b) => a.order - b.order)
    const opisWersji = (v: (typeof wersje)[number]) =>
      `v${v.version}${v.label ? ` (${v.label})` : ''}`

    const kawalek = [naglowek(1, `${c.name} — ${rodzaj(c.type)}`)]
    const biezaca = wersje.find((v) => v.id === c.currentVersionId)
    const wypisz = (v: (typeof wersje)[number], poziom: number) => {
      if (v.content.trim()) kawalek.push(v.content.trim())
      for (const s of stronyWersji(v.id)) {
        kawalek.push(naglowek(poziom, `Strona: ${s.name}`))
        if (s.content.trim()) kawalek.push(s.content.trim())
      }
    }
    if (biezaca) wypisz(biezaca, 2)
    const inne = wersje.filter((v) => v !== biezaca)
    if (inne.length && biezaca) kawalek.splice(1, 0, `Wersja ${opisWersji(biezaca)}`)
    for (const v of inne) {
      kawalek.push(naglowek(2, `Wersja ${opisWersji(v)}`))
      wypisz(v, 3)
    }
    czesci.push(kawalek.join('\n\n'))
  }
  return czesci.join('\n\n---\n\n')
}

/** Kopiuje kafelki do schowka. Zwraca, ile ich poszło. */
export async function kopiujKafelki(
  ids: string[],
  rodzaj: (typeId: string) => string,
): Promise<number> {
  const istniejace = (await db.concepts.bulkGet(ids)).filter(Boolean).map((c) => c!.id)
  if (!istniejace.length) return 0
  const tekst = await tekstKafelkow(istniejace, rodzaj)
  try {
    localStorage.setItem(KLUCZ, JSON.stringify({ tekst, ids: istniejace } satisfies Zapis))
  } catch {
    // bez pamięci przeglądarki zostaje sam tekst — też się przyda
  }
  await navigator.clipboard.writeText(tekst)
  return istniejace.length
}

/** Kafelki, które skopiowaliśmy jako ten tekst — albo null dla cudzego tekstu. */
export function kafelkiZeSchowka(tekst: string): string[] | null {
  try {
    const zapis = JSON.parse(localStorage.getItem(KLUCZ) ?? 'null') as Zapis | null
    if (!zapis || !tekst) return null
    const rowny = (a: string) => a.replace(/\r\n/g, '\n').trim()
    return rowny(zapis.tekst) === rowny(tekst) ? zapis.ids : null
  } catch {
    return null
  }
}

/** Wkleja kopie kafelków do folderu albo do ścieżki. Zwraca id kopii. */
export async function wklejKopie(
  ids: string[],
  cel: { folderId: string | null; pathId?: string },
): Promise<string[]> {
  const nowe: string[] = []
  for (const id of ids) {
    const n = await duplicateConcept(id, cel)
    if (n) nowe.push(n)
  }
  return nowe
}

/** Zdarzenie, którym lista po lewej oddaje wklejenie otwartej ścieżce. */
export const WKLEJ_DO_SCIEZKI = 'komp:wklej-kafelki'

/** Czy klawisz trafia w miejsce do pisania — wtedy Ctrl+C/V należy do tekstu. */
export function piszeTekst(cel: EventTarget | null): boolean {
  const el = cel instanceof Element ? cel : null
  if (!el) return false
  if (el.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return true
  const zaznaczenie = window.getSelection()
  return !!zaznaczenie && !zaznaczenie.isCollapsed && zaznaczenie.toString().trim() !== ''
}
