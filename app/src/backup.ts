import JSZip from 'jszip'
import { db } from './db'
import { wczytajObrazy } from './obrazy'
import { pobierzPlik } from './pulpit'
import type {
  BlockTypeDef,
  BlockVersion,
  Concept,
  Folder,
  LearningPath,
  PdfDoc,
  Relation,
  Subpage, Obraz, JednostkaNauki, PamiecKafelka, WpisNauki } from './types'

/** Struktura pliku danych wewnątrz archiwum kopii zapasowej. Blob-y PDF-ów
 *  leżą osobno jako prawdziwe pliki .pdf (nie base64 — mniejszy plik,
 *  łatwiej coś z niego odzyskać ręcznie w razie potrzeby). */
export interface BackupData {
  version: 1
  exportedAt: string
  concepts: Concept[]
  versions: BlockVersion[]
  folders: Folder[]
  paths: LearningPath[]
  pdfs: Omit<PdfDoc, 'data'>[]
  /** Strony kafelków (dowody itp.) — brak w starszych kopiach. */
  subpages?: Subpage[]
  /** Relacje między kafelkami — brak w starszych kopiach. */
  relations?: Relation[]
  /** Typy kafelków — brak w kopiach sprzed edytora typów. */
  blockTypes?: BlockTypeDef[]
  /** Zdjęcia z treści — brak w kopiach sprzed zdjęć. */
  obrazy?: Obraz[]
  /** Nauka: sektory i fiszki, pamięć kafelków, historia powtórek — brak
   *  w kopiach sprzed systemu nauki. Historia tylko się dopisuje, więc
   *  wczytanie jej z drugiego urządzenia niczego nie gubi. */
  nauka?: JednostkaNauki[]
  pamiec?: PamiecKafelka[]
  historia?: WpisNauki[]
  /** Ustawienia wyglądu (localStorage, klucze ui.*). Nie są danymi, ale
   *  kopia zapasowa ma odtworzyć program takim, jakim się go zostawiło. */
  ustawienia?: Record<string, string>
}

/** Zbiera ustawienia wyglądu z localStorage. */
function zbierzUstawienia(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith('ui.')) out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Nazwa pliku kopii: kompendium-2026-07-31.zip (kolejne w tym dniu dostają numer). */
function backupFileName(): string {
  const d = new Date()
  return `kompendium-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`
}

/** Zbiera całą bazę do jednej struktury — bez blobów PDF-ów, które w kopii
 *  jadą osobno jako pliki. Wspólne dla kopii zapasowej i dla migawki na
 *  telefon, żeby nie były dwiema implementacjami tego samego. */
export async function zbierzDane(): Promise<{ dane: BackupData; pdfy: PdfDoc[] }> {
  const [concepts, versions, folders, paths, pdfs, subpages, relations, blockTypes, obrazy, nauka, pamiec, historia] =
    await Promise.all([
      db.concepts.toArray(),
      db.versions.toArray(),
      db.folders.toArray(),
      db.paths.toArray(),
      db.pdfs.toArray(),
      db.subpages.toArray(),
      db.relations.toArray(),
      db.blockTypes.toArray(),
      db.obrazy.toArray(),
      db.nauka.toArray(),
      db.pamiec.toArray(),
      db.historia.toArray(),
    ])
  return {
    dane: {
      version: 1,
      exportedAt: new Date().toISOString(),
      concepts,
      versions,
      folders,
      paths,
      pdfs: pdfs.map(({ data: _blob, ...meta }) => meta),
      subpages,
      relations,
      blockTypes,
      obrazy,
      nauka,
      pamiec,
      historia,
      ustawienia: zbierzUstawienia(),
    },
    pdfy: pdfs,
  }
}

/** Wpisuje zebrane dane do bazy. Rekordy o tym samym id nadpisują istniejące,
 *  a czego w danych nie ma, to zostaje — więc wczytanie nigdy nie kasuje.
 *  Wspólne dla kopii zapasowej i migawki na telefon.
 *
 *  `zUstawieniami` rozdziela te dwa zastosowania. Kopia zapasowa ma odtworzyć
 *  program takim, jakim się go zostawiło — więc bierze też wygląd. Migawka na
 *  telefon nie: szerokości paneli i otwarty spis treści są ustawione pod
 *  duży ekran i na telefonie tylko zasłaniają treść. */
export async function wczytajDane(
  data: BackupData,
  pdfy: PdfDoc[],
  zUstawieniami = true,
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.concepts,
      db.versions,
      db.folders,
      db.paths,
      db.pdfs,
      db.subpages,
      db.relations,
      db.blockTypes,
      db.obrazy,
      db.nauka,
      db.pamiec,
      db.historia,
    ],
    async () => {
      await db.concepts.bulkPut(data.concepts)
      await db.versions.bulkPut(data.versions)
      await db.folders.bulkPut(data.folders)
      await db.paths.bulkPut(data.paths)
      if (pdfy.length) await db.pdfs.bulkPut(pdfy)
      await db.subpages.bulkPut(data.subpages ?? [])
      await db.relations.bulkPut(data.relations ?? [])
      await db.blockTypes.bulkPut(data.blockTypes ?? [])
      await db.obrazy.bulkPut(data.obrazy ?? [])
      await db.nauka.bulkPut(data.nauka ?? [])
      await db.pamiec.bulkPut(data.pamiec ?? [])
      await db.historia.bulkPut(data.historia ?? [])
    },
  )
  await wczytajObrazy()
  // ustawienia wracają na końcu: to zmiana wyglądu, nie danych, więc nie
  // ma po co blokować nią transakcji na bazie
  if (zUstawieniami) {
    for (const [k, v] of Object.entries(data.ustawienia ?? {})) localStorage.setItem(k, v)
  }
}

/** Pakuje całą bazę (kafelki, wersje, foldery, ścieżki, PDF-y) do jednego .zip. */
export async function zrobKopie(): Promise<Blob> {
  const { dane: data, pdfy: pdfs } = await zbierzDane()
  const zip = new JSZip()
  zip.file('dane.json', JSON.stringify(data, null, 1))
  const pdfFolder = zip.folder('pdfy')!
  for (const p of pdfs) pdfFolder.file(`${p.id}.pdf`, p.data)

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Eksportuje kopię do pliku (pobranie w przeglądarce, „Zapisz jako" w programie).
 *  Zwraca false, gdy użytkownik zrezygnował. */
export async function exportBackup(): Promise<boolean> {
  return pobierzPlik(backupFileName(), await zrobKopie())
}

export interface ImportSummary {
  concepts: number
  versions: number
  folders: number
  paths: number
  pdfs: number
}

/** Wczytuje kopię zapasową (.zip z exportBackup) i dopisuje jej zawartość do
 *  bieżącej bazy. Rekordy o tym samym id nadpisują istniejące (bezpieczne przy
 *  powtórnym imporcie tej samej kopii). */
export async function importBackup(file: File): Promise<ImportSummary> {
  const zip = await JSZip.loadAsync(file)
  const dataFile = zip.file('dane.json')
  if (!dataFile) throw new Error('To nie jest plik kopii zapasowej Kompendium (brak dane.json).')

  const data = JSON.parse(await dataFile.async('string')) as BackupData
  if (data.version !== 1) throw new Error(`Nieobsługiwana wersja kopii: ${data.version}`)

  const pdfs: PdfDoc[] = []
  for (const meta of data.pdfs) {
    const entry = zip.file(`pdfy/${meta.id}.pdf`)
    if (!entry) continue // wpis bez pliku — pomijamy, reszta importu jedzie dalej
    const blob = await entry.async('blob')
    pdfs.push({ ...meta, data: blob })
  }

  await wczytajDane(data, pdfs)

  return {
    concepts: data.concepts.length,
    versions: data.versions.length,
    folders: data.folders.length,
    paths: data.paths.length,
    pdfs: pdfs.length,
  }
}
