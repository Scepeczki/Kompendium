/** Znaczki interfejsu — jedna rodzina, jedna grubość kreski.
 *
 *  Emoji wyglądały inaczej na każdym systemie i część rysowała się kolorem,
 *  więc w jednym pasku robił się jarmark. Tu wszystko idzie z Lucide: te same
 *  proporcje, ta sama kreska, kolor dziedziczony po tekście.
 *
 *  Nazwy są po polsku, żeby w kodzie widoków czytać zamiar, a nie katalog:
 *  jak kiedyś zmienimy rodzinę znaczków, podmienia się tylko ta mapa. */

import {
  ChevronRight,
  Copy,
  FilePlus2,
  FolderPlus,
  Folder,
  ListFilter,
  Pencil,
  Route,
  Search,
  Settings2,
  Trash2,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'

const ICONS = {
  klocek: FilePlus2,
  folder: FolderPlus,
  folderZwykly: Folder,
  sciezka: Route,
  szukaj: Search,
  filtr: ListFilter,
  graf: Waypoints,
  ustawienia: Settings2,
  rozwin: ChevronRight,
  edycja: Pencil,
  kopia: Copy,
  usun: Trash2,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

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
