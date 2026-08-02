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

/** Typy do wyboru. Wycofane z wyboru (istniejące klocki nadal działają):
 *  - „intuicja" — jej rolę pełnią notatki na ścieżkach;
 *  - „dowód" — do przemyślenia, jak reprezentować dowody w twierdzeniach. */
export const BLOCK_TYPES: BlockType[] = (
  Object.keys(BLOCK_TYPE_LABELS) as BlockType[]
).filter((t) => t !== 'intuicja' && t !== 'dowod')

/** Krótkie oznaczenia typów do zwartych list. */
export const BLOCK_TYPE_SHORT: Record<BlockType, string> = {
  definicja: 'DEF',
  twierdzenie: 'TW',
  lemat: 'LEM',
  dowod: 'DOW',
  przyklad: 'PRZ',
  uwaga: 'UW',
  intuicja: 'INT',
}

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
  /** Nazwa grupy źródeł w obrębie klocka (proste folderowanie chipów). */
  group?: string
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
  /** Wspólna kolejność z klockami w obrębie rodzica (foldery i klocki się przeplatają). */
  order: number
  createdAt: string
}

/** Pojęcie — klocek wiedzy. Treść żyje wyłącznie w wersjach (BlockVersion). */
export interface Concept {
  id: string
  name: string
  type: BlockType
  tags: string[]
  /** Nazwa strony głównej klocka (domyślnie „Treść"). Same strony dodatkowe
   *  są w tabeli subpages; źródła należą do wersji, więc są wspólne dla
   *  wszystkich stron. */
  mainPageName?: string
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
  /** Nazwy grup źródeł (istnieją nawet gdy grupa jest chwilowo pusta). */
  sourceGroups?: string[]
  createdAt: string
  updatedAt: string
}

/** Dodatkowa strona klocka (najczęściej dowód — nazwa dowolna).
 *  Strony są wspólne dla wszystkich wersji pojęcia. */
export interface Subpage {
  id: string
  conceptId: string
  /** Np. „Dowód", „Dowód (indukcja)", „Szkic". */
  name: string
  /** Markdown + LaTeX. */
  content: string
  /** Kolejność na liście stron klocka. */
  order: number
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Ścieżki (Poziom Przestrzenny) — komponowanie klocków w skrypty nauki
// ---------------------------------------------------------------------------

/** Kafelek klocka na mapie ścieżki. */
export interface PathNodeBlock {
  id: string
  kind: 'block'
  conceptId: string
  /** Konkretna wersja użyta w tej ścieżce; null = zawsze bieżąca. */
  versionId: string | null
  /** Strona klocka pokazywana bazowo przy oglądaniu (null = główna treść). */
  subpageId?: string | null
  x: number
  y: number
}

/** Tkanka łączna / intuicja: luźny tekst (Markdown+LaTeX) należący do ścieżki. */
export interface PathNodeText {
  id: string
  kind: 'text'
  text: string
  x: number
  y: number
}

/** Komentarz do ścieżki: jak notatka, ale NIE trafia do generowanego skryptu. */
export interface PathNodeComment {
  id: string
  kind: 'comment'
  text: string
  /** Strona w widoku liniowym (notatka boczna). Domyślnie prawa. */
  side?: 'left' | 'right'
  x: number
  y: number
}

/** Fuzja: kilka klocków scalonych w jeden kafelek w obrębie tej ścieżki. */
export interface PathNodeFusion {
  id: string
  kind: 'fusion'
  name: string
  parts: { conceptId: string; versionId: string | null }[]
  x: number
  y: number
}

/** Rozdział / podrozdział — nagłówek dzielący ścieżkę na części. */
export interface PathNodeHeading {
  id: string
  kind: 'heading'
  text: string
  /** 1 = rozdział, 2 = podrozdział, 3 = sekcja. */
  level: 1 | 2 | 3
  x: number
  y: number
}

export type PathNode =
  | PathNodeBlock
  | PathNodeText
  | PathNodeComment
  | PathNodeFusion
  | PathNodeHeading

/** Strzałka logicznej kolejności między kafelkami. */
export interface PathEdge {
  id: string
  from: string
  to: string
  /** Kolejność wśród strzałek wychodzących z tego samego kafelka (1 = pierwsza).
   *  Brak = kolejność wg pozycji celu na mapie (y, potem x). */
  priority?: number
}

/** Ścieżka nauki — przestrzenna kompozycja klocków. Żyje w tym samym
 *  drzewie folderów co klocki (wspólna kolejność). */
export interface LearningPath {
  id: string
  name: string
  folderId: string | null
  order: number
  nodes: PathNode[]
  edges: PathEdge[]
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
