// Podstawowe typy danych Kompendium.
// Pełny opis formatu: docs/DATA-FORMAT.md w katalogu głównym repo.

/** Identyfikator typu kafelka. Kiedyś była to zamknięta lista siedmiu nazw;
 *  teraz typy są danymi (tabela `blockTypes`), bo każdy uczy się czego innego
 *  i „Aksjomat" albo „Kontrprzykład" nie mają prawa być przywilejem autora
 *  programu. Wbudowane typy zachowały swoje dawne identyfikatory, więc stare
 *  kafelki działają bez migracji. */
export type BlockType = string

/** Typ kafelka: nazwa, skrót do plakietki, barwa. */
export interface BlockTypeDef {
  /** Trafia do `Concept.type` — nie zmienia się przy zmianie nazwy. */
  id: string
  /** „Definicja" — widoczna nazwa. */
  label: string
  /** „DEF" — plakietka w listach i na kafelkach. */
  short: string
  color: string
  order: number
  /** Fabryczny — czyli taki, który program potrafi odtworzyć po skasowaniu
   *  („Przywróć fabryczne"). Nie chroni przed usunięciem: to typ użytkownika,
   *  a nie własność programu. */
  builtin?: boolean
  /** Schowany z listy wyboru. Istniejące kafelki takiego typu działają
   *  normalnie; po prostu nie proponujemy go przy nowych. */
  hidden?: boolean
  /** Ten rodzaj da się utworzyć wprost w ścieżce — dostaje przycisk „nowy
   *  ‹rodzaj›" w Linii i w menu mapy. Tak pisze się przykłady i zadania: na
   *  miejscu, bez zakładania kafelka w liście po lewej.
   *
   *  Nie mówi nic o tym, gdzie kafelek mieszka — o tym rozstrzyga
   *  `Concept.pathId`, ustawiany ręcznie, kafelek po kafelku. */
  wSciezce?: boolean
}

/** Fabryczne typy. Barwy te same, co dawniej w arkuszu stylów.
 *  „dowód" i „intuicja" startują schowane — tak było przed edytorem typów
 *  (dowody mają własne strony kafelka, intuicję zastąpiły notatki na ścieżce),
 *  ale teraz można je odsłonić jednym kliknięciem zamiast zmieniać kod. */
export const BUILTIN_BLOCK_TYPES: BlockTypeDef[] = [
  { id: 'definicja', label: 'Definicja', short: 'DEF', color: '#31619e', order: 1, builtin: true },
  { id: 'twierdzenie', label: 'Twierdzenie', short: 'TW', color: '#6d4a9e', order: 2, builtin: true },
  { id: 'lemat', label: 'Lemat', short: 'LEM', color: '#8a5fb0', order: 3, builtin: true },
  { id: 'przyklad', label: 'Przykład', short: 'PRZ', color: '#3d7a52', order: 4, builtin: true, wSciezce: true },
  { id: 'zadanie', label: 'Zadanie', short: 'ZAD', color: '#2f7b7b', order: 5, builtin: true, wSciezce: true },
  { id: 'uwaga', label: 'Uwaga', short: 'UW', color: '#a9742c', order: 6, builtin: true },
  { id: 'dowod', label: 'Dowód', short: 'DOW', color: '#6b6b66', order: 7, builtin: true, hidden: true },
  { id: 'intuicja', label: 'Intuicja', short: 'INT', color: '#b05575', order: 8, builtin: true, hidden: true },
]

/** Awaryjny opis typu, którego nie ma już w tabeli (np. po wczytaniu kopii
 *  z innego zestawu typów). Kafelek ma się pokazać, a nie zniknąć. */
export const unknownType = (id: string): BlockTypeDef => ({
  id,
  label: id,
  short: id.slice(0, 3).toUpperCase(),
  color: '#8d8677',
  order: 999,
})

/** Prostokąt na stronie PDF we współrzędnych strony przy skali 1
 *  (punkty PDF, początek w lewym górnym rogu strony). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface SourceRefBase {
  id: string
  /** Nazwa grupy źródeł w obrębie kafelka (proste folderowanie chipów). */
  group?: string
  note?: string
}

/** Context-Lock: odnośnik z treści kafelka do konkretnego miejsca w PDF. */
export interface PdfSourceRef extends SourceRefBase {
  /** Brak pola = źródło z PDF (zgodność ze starszymi danymi). */
  kind?: 'pdf'
  pdfId: string
  /** Numer strony, od 1. */
  page: number
  rect: Rect
}

/** Źródłem może być też inny kafelek — tak powstaje genealogia wiedzy:
 *  kafelek podsumowujący → kafelki z książek → wycinki stron. */
export interface BlockSourceRef extends SourceRefBase {
  kind: 'block'
  conceptId: string
  /** Konkretna wersja albo null = zawsze bieżąca. */
  versionId: string | null
}

export type SourceRef = PdfSourceRef | BlockSourceRef

export const isPdfSource = (r: SourceRef): r is PdfSourceRef =>
  (r as PdfSourceRef).pdfId !== undefined

export const isBlockSource = (r: SourceRef): r is BlockSourceRef =>
  (r as BlockSourceRef).conceptId !== undefined

/** Rodzaj folderu: na kafelki (drzewo) albo na PDF-y (jeden poziom). */
export type FolderKind = 'concepts' | 'pdfs'

/** Folder organizujący kafelki lub PDF-y. */
export interface Folder {
  id: string
  kind: FolderKind
  name: string
  /** Własny znaczek zamiast domyślnego folderu (nazwa z zestawu Lucide). */
  icon?: string
  /** Barwa znaczka (#rrggbb). Brak = zwykły kolor tekstu paska. */
  iconColor?: string
  /** Własna plakietka: do trzech znaków na barwnym tle, zamiast znaczka.
   *  Ma pierwszeństwo przed `icon`. */
  iconText?: string
  /** null = poziom główny. Dla kind='pdfs' zawsze null (bez zagnieżdżania). */
  parentId: string | null
  /** Wspólna kolejność z kafelkami w obrębie rodzica (foldery i kafelki się przeplatają). */
  order: number
  createdAt: string
}

/** Pojęcie — kafelek wiedzy. Treść żyje wyłącznie w wersjach (BlockVersion). */
export interface Concept {
  id: string
  name: string
  type: BlockType
  tags: string[]
  /** Nazwa strony głównej kafelka (domyślnie „Treść"). Same strony dodatkowe
   *  są w tabeli subpages; źródła należą do wersji, więc są wspólne dla
   *  wszystkich stron. */
  mainPageName?: string
  /** Własny znaczek w drzewie (nazwa z zestawu Lucide, np. „sigma").
   *  Brak = plakietka typu (DEF / TW …). */
  icon?: string
  /** Barwa znaczka (#rrggbb). Brak = kolor typu kafelka. */
  iconColor?: string
  /** Własna plakietka: do trzech znaków na barwnym tle, zamiast znaczka.
   *  Ma pierwszeństwo przed `icon`. */
  iconText?: string
  /** null = poziom główny drzewa. */
  folderId: string | null
  /** Kafelek mieszka tylko w tej ścieżce i nie pokazuje się w bibliotece po
   *  lewej. Tak robimy przykłady: należą do wykładu, w którym powstały, i nie
   *  zaśmiecają listy pojęć. Wyjęty ze ścieżki (albo skasowana ścieżka) —
   *  pole znika i kafelek wraca do biblioteki, nic nie ginie. */
  pathId?: string
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

// ---------------------------------------------------------------------------
// Relacje między kafelkami — warstwa wiedzy, niezależna od ścieżek.
// Wersje mówią „to samo pojęcie, inne ujęcie"; relacje mówią, jak różne
// pojęcia mają się do siebie (uogólnienie, równoważność, część, wymaganie).
// ---------------------------------------------------------------------------

/** Trzy osie powiązań między kafelkami:
 *  - `zawieranie` (mereologia) — to jest częścią tamtego,
 *  - `skala` (taksonomia i wnioskowanie) — to jest mocniejsze/szczegółowsze
 *    od tamtego; z mocniejszego wynika słabsze,
 *  - `perspektywa` (epistemologia) — dwa spojrzenia na ten sam zbiór znaczeń
 *    (odpowiednik wersji, tyle że między osobnymi kafelkami). */
export type RelationKind = 'zawieranie' | 'skala' | 'perspektywa'

/** Etykiety relacji widziane „od strony" kafelka źródłowego i docelowego. */
export const RELATION_LABELS: Record<
  RelationKind,
  { forward: string; backward: string; hint: string }
> = {
  zawieranie: {
    forward: 'zawiera',
    backward: 'jest częścią',
    hint: 'Mereologia: tamten kafelek jest pojęciową częścią tego',
  },
  skala: {
    forward: 'mocniejsze niż',
    backward: 'słabsze niż',
    hint: 'Skala i wnioskowanie: to jest uszczegółowieniem tamtego, z tego wynika tamto',
  },
  perspektywa: {
    forward: 'inna perspektywa',
    backward: 'inna perspektywa',
    hint: 'Epistemologia: dwa różne spojrzenia na ten sam zbiór znaczeń',
  },
}

export const RELATION_KINDS = Object.keys(RELATION_LABELS) as RelationKind[]

/** Nazwa grupy sąsiadów przy czytaniu: opisuje, czym są SĄSIEDZI względem
 *  bieżącego kafelka („przypadki szczególne"), a nie czym jest on sam. */
export function neighborGroupLabel(kind: RelationKind, outgoing: boolean): string {
  if (kind === 'perspektywa') return 'inne perspektywy'
  if (kind === 'zawieranie') return outgoing ? 'części' : 'całości'
  return outgoing ? 'ogólniejsze' : 'przypadki szczególne'
}

/** Relacje symetryczne nie mają wyróżnionego kierunku. */
export const isSymmetricRelation = (k: RelationKind) => k === 'perspektywa'

/** Skierowana relacja: `from` --kind--> `to`.
 *  Końce mogą wskazywać konkretną wersję — bo jedna perspektywa kafelka
 *  bywa uogólnieniem, a inna nie. Brak wersji = kafelek jako całość. */
export interface Relation {
  id: string
  fromId: string
  fromVersionId?: string | null
  toId: string
  toVersionId?: string | null
  kind: RelationKind
  /** Np. wartość parametru przy uszczegółowieniu („n = 1"). */
  note?: string
  createdAt: string
}

/** Dodatkowa strona kafelka (najczęściej dowód — nazwa dowolna).
 *  Strony są wspólne dla wszystkich wersji pojęcia. */
export interface Subpage {
  id: string
  conceptId: string
  /** Do której WERSJI kafelka należy ta strona.
   *
   *  Wersje są niezależne: mogą mieć różną liczbę stron i różne źródła. Do
   *  schematu v8 strony wisiały przy samym pojęciu, więc usunięcie strony
   *  w jednej wersji zabierało ją wszystkim — i to był błąd. Migracja dała
   *  każdej wersji własne kopie, żeby nic nie zniknęło. */
  versionId: string
  /** Np. „Dowód", „Dowód (indukcja)", „Szkic". */
  name: string
  /** Markdown + LaTeX. */
  content: string
  /** Kolejność na liście stron kafelka. */
  order: number
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Ścieżki (Poziom Przestrzenny) — komponowanie kafelków w skrypty nauki
// ---------------------------------------------------------------------------

/** Kafelek kafelka na mapie ścieżki. */
/** Tekst napisany W ŚCIEŻCE, osobno dla każdej wersji i strony kafelka.
 *  Klucz robi `kluczWlasnej`. Brak wpisu = kafelek pokazuje to, co w kafelku,
 *  i widzi wszystkie późniejsze poprawki zrobione w bibliotece. */
export type WlasneTresci = Record<string, string>

/** Klucz własnej treści: para (wersja, strona). Bez tego zmiana wersji
 *  pokazywałaby tekst napisany do innej. */
export const kluczWlasnej = (versionId: string, subpageId?: string | null) =>
  `${versionId}:${subpageId ?? ''}`

export interface PathNodeBlock {
  id: string
  kind: 'block'
  conceptId: string
  /** Konkretna wersja użyta w tej ścieżce; null = zawsze bieżąca. */
  versionId: string | null
  /** Strona kafelka pokazywana bazowo przy oglądaniu (null = główna treść). */
  subpageId?: string | null
  /** Nazwa nadana kafelkowi w tej ścieżce. Brak = nazwa kafelka. */
  nazwa?: string
  /** Treść napisana w tej ścieżce — kafelek zostaje nietknięty. */
  wlasneTresci?: WlasneTresci
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

/** Fuzja: kilka kafelków scalonych w jeden kafelek w obrębie tej ścieżki.
 *  Kafelki w bazie zostają atomowe — to jest wyłącznie sposób pokazania. */
/** Jeden kafelek wewnątrz scalonej całości: która wersja i która strona. */
export interface FusionPart {
  conceptId: string
  versionId: string | null
  /** Strona kafelka (null / brak = strona główna). */
  subpageId?: string | null
  /** Treść napisana w tej ścieżce dla tego składnika — jak w zwykłym
   *  kafelku, kafelek w bazie zostaje nietknięty. */
  wlasneTresci?: WlasneTresci
  /** Własny podpis paska stron w tej ścieżce — zamiast „Treść".
   *  Nazwa strony w bibliotece zostaje nietknięta. */
  etykieta?: string
  /** Pasek stron tego składnika schowany (tylko w tej ścieżce). */
  pasekUkryty?: boolean
  /** Strony schowane z tego paska — id strony albo „glowna" dla strony
   *  głównej kafelka. Sama strona zostaje, tylko nie zajmuje miejsca. */
  ukryteStrony?: string[]
  /** Pasek doczepiony do paska innego składnika (jego numer). Tak buduje
   *  się jeden wspólny rząd zakładek — przeciągnięciem, nie ustawieniem. */
  pasekPrzy?: number
}

export interface PathNodeFusion {
  id: string
  kind: 'fusion'
  name: string
  /** Czym jest scalona całość (np. jedno twierdzenie z dwóch twierdzeń).
   *  Brak = neutralny „Blok". */
  type?: BlockType
  parts: FusionPart[]
  /** Własna treść całości. Scalone definicje rzadko czytają się gładko jedna
   *  po drugiej — tu można je przepisać na jeden tekst. Brak = pokazujemy
   *  treści składników po kolei, jak dotąd. Kafelki w bazie zostają nietknięte,
   *  ten tekst żyje wyłącznie w tej ścieżce. */
  content?: string
  /** Gdzie stoją paski stron w tym scalonym bloku (tylko w tej ścieżce).
   *
   *  Domyślnie każdy składnik ma swój pasek nad treścią — i wtedy dwa
   *  zdania, które mają się czytać jako jedno, wyglądają jak dwa osobne
   *  kawałki. Stąd wybór: schować je zupełnie, zebrać w jeden rząd dla
   *  całego bloku albo zostawić przy każdym składniku. */
  paski?: 'kazdy' | 'jeden' | 'brak'
  /** Przy jednym rzędzie: nad treścią czy pod nią. */
  paskiGdzie?: 'gora' | 'dol'
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

/** Ścieżka nauki — przestrzenna kompozycja kafelków. Żyje w tym samym
 *  drzewie folderów co kafelki (wspólna kolejność). */
export interface LearningPath {
  id: string
  name: string
  /** Własny znaczek zamiast domyślnej mapki (nazwa z zestawu Lucide). */
  icon?: string
  /** Barwa znaczka (#rrggbb). Brak = kolor akcentu. */
  iconColor?: string
  /** Własna plakietka: do trzech znaków na barwnym tle, zamiast znaczka.
   *  Ma pierwszeństwo przed `icon`. */
  iconText?: string
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
