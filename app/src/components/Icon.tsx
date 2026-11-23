/** Znaczki interfejsu — jedna rodzina, jedna grubość kreski.
 *
 *  Emoji wyglądały inaczej na każdym systemie i część rysowała się kolorem,
 *  więc w jednym pasku robił się jarmark. Tu wszystko idzie z Lucide: te same
 *  proporcje, ta sama kreska, kolor dziedziczony po tekście.
 *
 *  Dwie grupy nazw i to celowo:
 *  — po polsku (`kafelek`, `ustawienia`) to role w interfejsie; kiedyś zmienimy
 *    rodzinę znaczków i podmieni się tylko ta mapa, a widoki zostaną bez zmian;
 *  — po angielsku (`sigma`, `book-open`) to znaczki do wyboru przez użytkownika.
 *    Ich nazwy lądują w bazie przy kafelkach i folderach, więc muszą być stabilne
 *    — stąd oryginalne nazwy z Lucide, a nie nasze tłumaczenia. */

import {
  Anchor,
  Hourglass,
  Atom,
  Binary,
  Book,
  BookOpen,
  Bookmark,
  Boxes,
  Brain,
  Calculator,
  ChevronLeft,
  ImagePlus,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleHelp,
  Clock,
  Combine,
  Compass,
  Copy,
  Divide,
  Equal,
  ExternalLink,
  Feather,
  FileText,
  FilePlus2,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderPlus,
  Heading1,
  Heading2,
  House,
  GitBranch,
  Globe,
  GraduationCap,
  Grid2x2,
  Hash,
  Heart,
  Hexagon,
  Infinity as InfinityIcon,
  Key,
  Layers,
  Library,
  Lightbulb,
  List,
  ListTree,
  ListFilter,
  Lock,
  Map,
  MessageSquare,
  Move,
  Eye,
  EyeOff,
  Contrast,
  Microscope,
  Milestone,
  Network,
  NotebookPen,
  Pencil,
  PenTool,
  Percent,
  Pi,
  Pin,
  Puzzle,
  Quote,
  Radical,
  RotateCcw,
  Route,
  Ruler,
  Scale,
  Search,
  Settings2,
  Split,
  Shapes,
  Sigma,
  Sparkles,
  Spline,
  Square,
  SquareFunction,
  Star,
  Tag,
  Target,
  Telescope,
  Trash2,
  Triangle,
  TriangleAlert,
  Waypoints,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS = {
  // role w interfejsie
  kafelek: FilePlus2,
  folder: FolderPlus,
  folderZwykly: Folder,
  sciezka: Route,
  szukaj: Search,
  filtr: ListFilter,
  graf: Waypoints,
  ustawienia: Settings2,
  rozwin: ChevronRight,
  spisOgolny: List,
  spisSzczegolowy: ListTree,
  zdjecie: ImagePlus,
  poziomWyzej: ChevronLeft,
  poziomNizej: ChevronRight,
  edycja: Pencil,
  kopia: Copy,
  usun: Trash2,
  przesun: Move,
  zakryj: Contrast,
  nauka: GraduationCap,
  uwaga: TriangleAlert,
  przerwa: Hourglass,
  odkryj: Eye,
  zakryty: EyeOff,
  // czynności w menu pod prawym przyciskiem — wcześniej emoji i znaki
  // typograficzne (🗑 ✎ 💬 § ⌂ ⧉ ↺), czyli jarmark w jednym menu
  otworz: ExternalLink,
  tutaj: House,
  rozdzial: Heading1,
  podrozdzial: Heading2,
  notatka: NotebookPen,
  komentarz: MessageSquare,
  scal: Combine,
  rozdziel: Split,
  przywroc: RotateCcw,

  // znaczki do wyboru — nazwy trafiają do bazy, więc są nietykalne
  'file-text': FileText,
  'notebook-pen': NotebookPen,
  'book-open': BookOpen,
  book: Book,
  library: Library,
  'graduation-cap': GraduationCap,
  quote: Quote,
  'message-square': MessageSquare,

  sigma: Sigma,
  pi: Pi,
  radical: Radical,
  infinity: InfinityIcon,
  'square-function': SquareFunction,
  percent: Percent,
  divide: Divide,
  equal: Equal,
  binary: Binary,
  calculator: Calculator,

  triangle: Triangle,
  circle: Circle,
  square: Square,
  hexagon: Hexagon,
  shapes: Shapes,
  spline: Spline,
  compass: Compass,
  ruler: Ruler,
  scale: Scale,
  'pen-tool': PenTool,

  lightbulb: Lightbulb,
  brain: Brain,
  sparkles: Sparkles,
  zap: Zap,
  key: Key,
  lock: Lock,
  'triangle-alert': TriangleAlert,
  'circle-check': CircleCheck,
  'circle-help': CircleHelp,
  target: Target,

  'folder-open': FolderOpen,
  layers: Layers,
  boxes: Boxes,
  'grid-2x2': Grid2x2,
  list: List,
  tag: Tag,
  hash: Hash,
  puzzle: Puzzle,
  bookmark: Bookmark,
  pin: Pin,

  network: Network,
  'git-branch': GitBranch,
  map: Map,
  milestone: Milestone,
  anchor: Anchor,
  globe: Globe,
  clock: Clock,
  atom: Atom,
  'flask-conical': FlaskConical,
  microscope: Microscope,
  telescope: Telescope,
  feather: Feather,
  star: Star,
  heart: Heart,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/** Znaczki do wyboru, w kupkach — inaczej pięćdziesiąt kratek nic nie mówi. */
export const PICK_GROUPS: { label: string; names: IconName[] }[] = [
  {
    label: 'Pismo',
    names: [
      'file-text',
      'notebook-pen',
      'book-open',
      'book',
      'library',
      'graduation-cap',
      'quote',
      'message-square',
    ],
  },
  {
    label: 'Matematyka',
    names: [
      'sigma',
      'pi',
      'radical',
      'infinity',
      'square-function',
      'percent',
      'divide',
      'equal',
      'binary',
      'calculator',
    ],
  },
  {
    label: 'Kształty',
    names: [
      'triangle',
      'circle',
      'square',
      'hexagon',
      'shapes',
      'spline',
      'compass',
      'ruler',
      'scale',
      'pen-tool',
    ],
  },
  {
    label: 'Znaczenie',
    names: [
      'lightbulb',
      'brain',
      'sparkles',
      'zap',
      'key',
      'lock',
      'triangle-alert',
      'circle-check',
      'circle-help',
      'target',
    ],
  },
  {
    label: 'Porządek',
    names: [
      'folder-open',
      'layers',
      'boxes',
      'grid-2x2',
      'list',
      'tag',
      'hash',
      'puzzle',
      'bookmark',
      'pin',
    ],
  },
  {
    label: 'Inne',
    names: [
      'network',
      'git-branch',
      'map',
      'milestone',
      'anchor',
      'globe',
      'clock',
      'atom',
      'flask-conical',
      'microscope',
      'telescope',
      'feather',
      'star',
      'heart',
    ],
  },
]

/** Czy zapisana w bazie nazwa nadal wskazuje na istniejący znaczek.
 *  Chroni przed pustką, gdyby kiedyś któryś zniknął z zestawu. */
export const isIconName = (v: string | undefined): v is IconName =>
  !!v && v in ICONS

interface Props {
  name: IconName
  /** Rozmiar w em — domyślnie odrobinę więcej niż wysokość wersalika. */
  size?: number
}

export function Icon({ name, size = 1.15 }: Props) {
  const Glyph = ICONS[name]
  return (
    <Glyph
      className="ico"
      size={`${size}em`}
      strokeWidth={1.75}
      absoluteStrokeWidth={false}
      aria-hidden="true"
    />
  )
}
