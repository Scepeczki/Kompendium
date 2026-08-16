import JSZip from 'jszip'
import { db } from './db'
import type {
  BlockTypeDef,
  BlockVersion,
  Concept,
  Folder,
  LearningPath,
  PdfDoc,
  Relation,
  Subpage,
} from './types'

/** Struktura pliku danych wewnątrz archiwum kopii zapasowej. Blob-y PDF-ów
 *  leżą osobno jako prawdziwe pliki .pdf (nie base64 — mniejszy plik,
 *  łatwiej coś z niego odzyskać ręcznie w razie potrzeby). */
interface BackupData {
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

/** Eksportuje całą bazę (kafelki, wersje, foldery, ścieżki, PDF-y) do jednego
 *  pliku .zip i uruchamia jego pobranie w przeglądarce. */
export async function exportBackup(): Promise<void> {
  const [concepts, versions, folders, paths, pdfs, subpages, relations] =
    await Promise.all([
      db.concepts.toArray(),
      db.versions.toArray(),
      db.folders.toArray(),
      db.paths.toArray(),
      db.pdfs.toArray(),
      db.subpages.toArray(),
      db.relations.toArray(),
    ])
  const blockTypes = await db.blockTypes.toArray()

  const zip = new JSZip()
  const data: BackupData = {
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
    ustawienia: zbierzUstawienia(),
  }
  zip.file('dane.json', JSON.stringify(data, null, 1))
  const pdfFolder = zip.folder('pdfy')!
  for (const p of pdfs) pdfFolder.file(`${p.id}.pdf`, p.data)

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.click()
  URL.revokeObjectURL(url)
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
    ],
    async () => {
      await db.concepts.bulkPut(data.concepts)
      await db.versions.bulkPut(data.versions)
      await db.folders.bulkPut(data.folders)
      await db.paths.bulkPut(data.paths)
      await db.pdfs.bulkPut(pdfs)
      await db.subpages.bulkPut(data.subpages ?? [])
      await db.relations.bulkPut(data.relations ?? [])
      await db.blockTypes.bulkPut(data.blockTypes ?? [])
    },
  )

  // ustawienia wracają na końcu: to zmiana wyglądu, nie danych, więc nie
  // ma po co blokować nią transakcji na bazie
  for (const [k, v] of Object.entries(data.ustawienia ?? {})) localStorage.setItem(k, v)

  return {
    concepts: data.concepts.length,
    versions: data.versions.length,
    folders: data.folders.length,
    paths: data.paths.length,
    pdfs: pdfs.length,
  }
}
