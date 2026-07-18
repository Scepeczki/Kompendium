// Podstawowe typy danych Kompendium.
// Pełny opis formatu: docs/DATA-FORMAT.md w katalogu głównym repo.

export type BlockType =
  | 'definicja'
  | 'twierdzenie'
  | 'lemat'
  | 'dowod'
  | 'przyklad'
  | 'uwaga'
  | 'intuicja'

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  definicja: 'Definicja',
  twierdzenie: 'Twierdzenie',
  lemat: 'Lemat',
  dowod: 'Dowód',
  przyklad: 'Przykład',
  uwaga: 'Uwaga',
  intuicja: 'Intuicja',
}

export const BLOCK_TYPES = Object.keys(BLOCK_TYPE_LABELS) as BlockType[]

/** Prostokąt na stronie PDF we współrzędnych strony przy skali 1
 *  (punkty PDF, początek w lewym górnym rogu strony). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Context-Lock: odnośnik z treści klocka do konkretnego miejsca w PDF. */
export interface SourceRef {
  id: string
  pdfId: string
  /** Numer strony, od 1. */
  page: number
  rect: Rect
  note?: string
}

/** Rodzaj folderu: na klocki (drzewo) albo na PDF-y (jeden poziom). */
export type FolderKind = 'concepts' | 'pdfs'

/** Folder organizujący klocki lub PDF-y. */
export interface Folder {
  id: string
  kind: FolderKind
  name: string
  /** null = poziom główny. Dla kind='pdfs' zawsze null (bez zagnieżdżania). */
  parentId: string | null
  createdAt: string
}

/** Pojęcie — klocek wiedzy. Treść żyje wyłącznie w wersjach (BlockVersion). */
export interface Concept {
  id: string
  name: string
  type: BlockType
  tags: string[]
  /** null = poziom główny drzewa. */
  folderId: string | null
  /** Ręczna kolejność w obrębie folderu (ułamkowa — wstawianie pomiędzy). */
  order: number
  /** ISO — punkt na osi zdobywania wiedzy. */
  createdAt: string
  updatedAt: string
  currentVersionId: string
}

/** Wersja treści pojęcia — model „zapisz jako v2". Stare wersje są tylko do odczytu. */
export interface BlockVersion {
  id: string
  conceptId: string
  version: number
  /** Np. „wg Rudina". */
  label?: string
  /** Markdown + LaTeX. */
  content: string
  sourceRefs: SourceRef[]
  createdAt: string
  updatedAt: string
}

/** Zaimportowany dokument PDF, przechowywany lokalnie w IndexedDB. */
export interface PdfDoc {
  id: string
  title: string
  fileName: string
  /** null = poza folderami (poziom główny biblioteki). */
  folderId: string | null
  addedAt: string
  data: Blob
}
