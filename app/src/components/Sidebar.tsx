import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { odmien } from '../odmiana'
import {
  addConceptToPath,
  conceptsOwnedByPath,
  createConcept,
  createFolder,
  createPath,
  db,
  deleteConcept,
  deleteFolder,
  deletePath,
  duplicateConcept,
  duplicateFolder,
  duplicatePath,
  moveConcept,
  moveFolder,
  movePath,
  updateConcept,
  updateFolder,
  updatePath,
} from '../db'
import { type Concept, type Folder, type LearningPath } from '../types'
import { topoOrder } from '../topo'
import { wlozDoFolderuSciezki } from '../folderSciezki'
import {
  WKLEJ_DO_SCIEZKI,
  kafelkiZeSchowka,
  kopiujKafelki,
  piszeTekst,
  wklejKopie,
} from '../schowekKafelkow'
import { Icon, isIconName, type IconName } from './Icon'
import { useBlockTypes } from '../blockTypes'
import { NameDialog } from './NameDialog'
import { useDialogs } from './Dialogs'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
  graphActive: boolean
  onToggleGraph: () => void
  openPathId: string | null
  onOpenPath: (id: string) => void
  onOpenSettings: () => void
}

/** Ładunek przeciągania: pojedyncza rzecz albo całe zaznaczenie. */
type DragPayload =
  | { kind: 'concept' | 'folder' | 'path'; id: string }
  | { kind: 'wiele'; items: { kind: 'concept' | 'folder' | 'path'; id: string }[] }

/** Element wspólnej listy dzieci folderu (foldery, kafelki i ścieżki przeplatają się). */
type TreeNode =
  | { kind: 'folder'; id: string; order: number; folder: Folder }
  | { kind: 'concept'; id: string; order: number; concept: Concept }
  | { kind: 'path'; id: string; order: number; path: LearningPath }

/** Podpowiedź wizualna miejsca upuszczenia. */
type DropHint = { id: string; pos: 'into' | 'before' | 'after' } | null

/** Na czym stanął prawy przycisk: na pustym tle czy na konkretnej rzeczy. */
type MenuTarget =
  | { kind: 'tlo'; parentId: string | null }
  | { kind: 'concept'; concept: Concept }
  | { kind: 'folder'; folder: Folder }
  | { kind: 'path'; path: LearningPath }

const MIME = 'text/x-kompendium'

/** Własna barwa znaczka albo nic (wtedy decyduje arkusz stylów). */
const barwa = (hex: string | undefined) => (hex ? { color: hex } : undefined)
/** Własna plakietka bierze barwę tak samo jak plakietka rodzaju — przez
 *  `--block-color`, bo z niej wywodzi się i tekst, i tło, i obramowanie. */
const tloPlakietki = (hex: string | undefined) =>
  hex ? ({ '--block-color': hex } as React.CSSProperties) : undefined
const EXP_KEY = 'ui.expandedFolders'

const loadExpanded = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXP_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const setDragData = (e: React.DragEvent, payload: DragPayload) => {
  e.dataTransfer.setData(MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'move'
}

const getDragData = (e: React.DragEvent): DragPayload | null => {
  try {
    const raw = e.dataTransfer.getData(MIME)
    return raw ? (JSON.parse(raw) as DragPayload) : null
  } catch {
    return null
  }
}

export function Sidebar({
  selectedId,
  onSelect,
  graphActive,
  onToggleGraph,
  openPathId,
  onOpenPath,
  onOpenSettings,
}: Props) {
  const typy = useBlockTypes()
  const dlg = useDialogs()
  const [search, setSearch] = useState('')
  /** Filtr listy. Pusty zbiór = pokaż wszystko. Poza rodzajami kafelków może
   *  zawierać `SCIEZKI` — ścieżki są w tej liście na równi z kafelkami, więc
   *  i w filtrze muszą być. Zbiór, a nie jedna wartość, bo szukając czegoś
   *  chce się zwykle widzieć np. definicje RAZEM z twierdzeniami. */
  const [wybraneTypy, setWybraneTypy] = useState<Set<string>>(new Set())
  /** Ctrl+K przenosi do szukania z każdego miejsca programu. */
  const szukajRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const klawisz = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        szukajRef.current?.focus()
        szukajRef.current?.select()
      }
    }
    window.addEventListener('keydown', klawisz)
    return () => window.removeEventListener('keydown', klawisz)
  }, [])

  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)
  const [dropHint, setDropHint] = useState<DropHint>(null)
  const [rootHint, setRootHint] = useState(false)

  /** Zaznaczenie wielu rzeczy naraz: Ctrl dokłada pojedynczo, Shift bierze
   *  zakres. Przeciągnięcie którejkolwiek z nich przenosi całą grupę. */
  const [zaznaczone, setZaznaczone] = useState<Set<string>>(new Set())
  /** Ostatnio kliknięty wiersz — punkt zaczepienia dla Shift. */
  const kotwicaRef = useRef<string | null>(null)

  /** Otwarte okienko nazwy (nowa rzecz albo zmiana istniejącej). */
  const [dialog, setDialog] = useState<{
    title: string
    name: string
    icon?: string
    iconColor?: string
    fallbackIcon: IconName
    /** Plakietka rodzaju — pokazywana zamiast znaczka, gdy własnego nie ma. */
    plakietka?: { skrot: string; kolor: string }
    placeholder?: string
    iconText?: string
    onSave: (
      name: string,
      icon: string | undefined,
      iconColor: string | undefined,
      iconText: string | undefined,
    ) => void | Promise<void>
  } | null>(null)

  /** Menu spod prawego przycisku. Na pustym tle proponuje tworzenie
   *  (a `parentId` mówi gdzie: wnętrze folderu czy poziom główny),
   *  na konkretnej rzeczy — co można z nią zrobić. */
  const [menu, setMenu] = useState<{ x: number; y: number; cel: MenuTarget } | null>(
    null,
  )

  /** Która pozycja menu jest rozwinięta. Klik ją otwiera i zamyka — samo
   *  najechanie też pokazuje, ale po kliknięciu musi dać się złożyć z
   *  powrotem tym samym kliknięciem. */
  const [rozwiniete, setRozwiniete] = useState<string | null>(null)

  // menu znika przy kliknięciu gdzie indziej, Escape i przewijaniu listy
  useEffect(() => {
    if (!menu) setRozwiniete(null)
    if (!menu) return
    // Nasłuch w fazie przechwytywania, bo w zwykłej bąbelkowej zdarzenie
    // bywa zatrzymane po drodze (pole tekstowe robi to samo z każdym
    // kliknięciem) — i menu zostawało otwarte, choć kliknęło się obok.
    // Kliknięcia w samym menu rozpoznajemy po elemencie, nie po propagacji.
    const close = (e: Event) => {
      const cel = e.target
      if (cel instanceof Element && cel.closest('.tree-menu')) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('mousedown', close, true)
    document.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close, true)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  /** Menu nie może wyjść poza okno — inaczej ostatnia pozycja bywa nieklikalna. */
  const menuRef = (el: HTMLDivElement | null) => {
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = Math.min(0, window.innerWidth - 6 - r.right)
    const dy = Math.min(0, window.innerHeight - 6 - r.bottom)
    if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`
  }

  /** Prawy przycisk na pustym miejscu listy (nie na kafelku, folderze, ścieżce). */
  const openMenu = (e: React.MouseEvent) => {
    const el = e.target as Element
    if (el.closest('.concept-item, .folder-row')) return
    e.preventDefault()
    const inside = el.closest('.folder-children') as HTMLElement | null
    setMenu({
      x: e.clientX,
      y: e.clientY,
      cel: { kind: 'tlo', parentId: inside?.dataset.folder ?? null },
    })
  }

  /** Prawy przycisk na konkretnej rzeczy w drzewie. */
  const openItemMenu = (e: React.MouseEvent, cel: MenuTarget) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, cel })
  }

  /** Pozycja menu — zamyka je, zanim zrobi swoje (żeby okienko z nazwą
   *  nie wyskakiwało zza wciąż otwartego menu). */
  const menuItem = (
    ikona: IconName,
    label: string,
    onClick: () => void,
    grozne = false,
  ) => (
    <button
      className={`tree-menu-item ${grozne ? 'grozne' : ''}`}
      onClick={() => {
        setMenu(null)
        onClick()
      }}
    >
      <Icon name={ikona} size={1} />
      {label}
    </button>
  )

  const menuParent = menu?.cel.kind === 'tlo' ? menu.cel.parentId : null

  const handleMenuRename = () => {
    if (!menu) return
    if (menu.cel.kind === 'concept') handleRenameConcept(menu.cel.concept)
    else if (menu.cel.kind === 'folder') handleRenameFolder(menu.cel.folder)
    else if (menu.cel.kind === 'path') handleRenamePath(menu.cel.path)
  }

  /** Wkłada do ścieżki kafelek spod prawego przycisku — a jeśli kliknięto
   *  jeden z zaznaczonych, to całe zaznaczenie. Przykłady i zadania od razu
   *  się w niej zadomawiają (znikają z tej listy); reszta zostaje. */
  const wlozDoSciezki = async (pathId: string) => {
    if (!menu || menu.cel.kind !== 'concept') return
    const cel = menu.cel.concept.id
    const ids = zaznaczone.has(cel)
      ? [...zaznaczone].filter((id) => concepts.some((c) => c.id === id))
      : [cel]
    for (const id of ids) await addConceptToPath(pathId, id)
  }

  /** Id rzeczy spod prawego przycisku (puste tło nie ma żadnego). */
  const idCelu = (cel: MenuTarget) =>
    cel.kind === 'concept'
      ? cel.concept.id
      : cel.kind === 'folder'
        ? cel.folder.id
        : cel.kind === 'path'
          ? cel.path.id
          : null
  /** Prawy przycisk na jednej z zaznaczonych rzeczy dotyczy całej grupy. */
  const naGrupie = !!menu && zaznaczone.size > 1 && zaznaczone.has(idCelu(menu.cel) ?? '')

  /** Usuwa całe zaznaczenie po jednym pytaniu. */
  const usunZaznaczone = async () => {
    const k = [...concepts, ...tutejsze].filter((c) => zaznaczone.has(c.id))
    const s = paths.filter((p) => zaznaczone.has(p.id))
    const f = folders.filter((x) => zaznaczone.has(x.id))
    if (!k.length && !s.length && !f.length) return
    const czesci = [
      k.length ? odmien(k.length, 'kafelek', 'kafelki', 'kafelków') : '',
      s.length ? odmien(s.length, 'ścieżkę', 'ścieżki', 'ścieżek') : '',
      f.length ? odmien(f.length, 'folder', 'foldery', 'folderów') : '',
    ].filter(Boolean)
    const ok = await dlg.confirm({
      title: `Usunąć zaznaczone: ${czesci.join(', ')}?`,
      message:
        (k.length
          ? 'Kafelki znikną razem z wersjami, stronami i powiązaniami, także ze ścieżek, w których stoją. '
          : '') +
        (s.length ? 'Kafelki z usuniętych ścieżek zostają w liście. ' : '') +
        (f.length ? 'Zawartość usuniętych folderów przechodzi poziom wyżej. ' : '') +
        'Tego nie da się cofnąć.',
      confirmLabel: 'Usuń zaznaczone',
      danger: true,
    })
    if (!ok) return
    for (const c of k) await deleteConcept(c.id)
    for (const p of s) await deletePath(p.id)
    for (const x of f) await deleteFolder(x.id)
    setZaznaczone(new Set())
    pokaz(`Usunięto: ${czesci.join(', ')}`)
  }

  const handleMenuDelete = () => {
    if (!menu) return
    if (naGrupie) {
      void usunZaznaczone()
      return
    }
    if (menu.cel.kind === 'concept') handleDeleteConcept(menu.cel.concept)
    else if (menu.cel.kind === 'folder') handleDeleteFolder(menu.cel.folder)
    else if (menu.cel.kind === 'path') handleDeletePath(menu.cel.path)
  }

  /** Powielenie. Kopia kafelka od razu się otwiera — zwykle powiela się po to,
   *  żeby coś w kopii zmienić. Folder tylko się rozwija, bo w środku może
   *  być tego dużo i nie wiadomo, co miałoby się otworzyć. */
  const handleMenuDuplicate = async () => {
    if (!menu) return
    if (menu.cel.kind === 'concept') {
      const id = await duplicateConcept(menu.cel.concept.id)
      if (id) onSelect(id)
    } else if (menu.cel.kind === 'path') {
      const id = await duplicatePath(menu.cel.path.id)
      if (id) onOpenPath(id)
    } else if (menu.cel.kind === 'folder') {
      const id = await duplicateFolder(menu.cel.folder.id)
      if (id) setExpanded((prev) => persistExpanded(new Set(prev).add(id)))
    }
  }

  const folders =
    useLiveQuery(() => db.folders.where('kind').equals('concepts').toArray(), []) ?? []
  // Kafelki z `pathId` mieszkają w swojej ścieżce (przykłady) — biblioteka
  // ma być listą pojęć, a nie wysypiskiem przykładów do nich.
  const concepts =
    useLiveQuery(() => db.concepts.filter((c) => !c.pathId).toArray(), []) ?? []
  const paths = useLiveQuery(() => db.paths.toArray(), []) ?? []

  /** Ścieżki mają w filtrze własną pozycję, obok rodzajów kafelków. */
  const SCIEZKI = '@sciezki'
  const TUTEJSZE = '@tutejsze'
  const chceSciezki = wybraneTypy.has(SCIEZKI)
  const chceTutejsze = wybraneTypy.has(TUTEJSZE)
  const wybraneRodzaje = new Set(
    [...wybraneTypy].filter((t) => t !== SCIEZKI && t !== TUTEJSZE),
  )
  /** Kafelki mieszkające w ścieżkach. Drzewo ich nie pokazuje, więc filtr
   *  jest jedynym miejscem, w którym widać je wszystkie naraz. */
  const tutejsze =
    useLiveQuery(() => db.concepts.filter((c) => !!c.pathId).toArray(), []) ?? []
  /** Kafelki mieszkające w ścieżce, w kolejności, w jakiej w niej stoją.
   *  Ścieżka pokazuje je jak folder swoją zawartość. */
  const kafelkiSciezki = (p: LearningPath): Concept[] => {
    const miejsce = new Map<string, number>()
    topoOrder(p.nodes, p.edges).forEach((n, i) => {
      if (n.kind === 'block') miejsce.set(n.conceptId, i)
      if (n.kind === 'fusion') for (const c of n.parts) miejsce.set(c.conceptId, i)
    })
    const gdzie = (c: Concept) => miejsce.get(c.id) ?? Number.MAX_SAFE_INTEGER
    return tutejsze.filter((c) => c.pathId === p.id).sort((a, b) => gdzie(a) - gdzie(b))
  }

  /** Krótka wiadomość pod listą („Skopiowano 3 kafelki"). */
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const komunikatT = useRef(0)
  const pokaz = (tekst: string) => {
    setKomunikat(tekst)
    window.clearTimeout(komunikatT.current)
    komunikatT.current = window.setTimeout(() => setKomunikat(null), 2600)
  }
  // inne części programu (Linia) też mają tu coś do powiedzenia
  useEffect(() => {
    const h = (e: Event) => pokaz(String((e as CustomEvent<string>).detail))
    window.addEventListener('komp:komunikat', h)
    return () => window.removeEventListener('komp:komunikat', h)
  }, [])

  /** Rodzaje do filtrowania: tylko te, które naprawdę są na liście. */
  const rodzajeNaLiscie = typy.all.filter((t) => concepts.some((c) => c.type === t.id))
  const przelaczTyp = (id: string) =>
    setWybraneTypy((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const filtering = search.trim() !== '' || wybraneTypy.size > 0

  // Odporność na osierocone odwołania: jeśli folderId/parentId wskazuje na
  // folder, który już nie istnieje (np. zaszłość ze starszej wersji bazy),
  // element traktujemy jak leżący na poziomie głównym zamiast go tracić z oczu.
  const folderIds = new Set(folders.map((f) => f.id))
  const effectiveParent = (id: string | null) => (id && folderIds.has(id) ? id : null)

  /** Dzieci rodzica: foldery, kafelki i ścieżki we wspólnej, ręcznej kolejności. */
  const children = (parentId: string | null): TreeNode[] => {
    const fs: TreeNode[] = folders
      .filter((f) => effectiveParent(f.parentId ?? null) === parentId)
      .map((f) => ({ kind: 'folder', id: f.id, order: f.order ?? 0, folder: f }))
    const cs: TreeNode[] = concepts
      .filter((c) => effectiveParent(c.folderId ?? null) === parentId)
      .map((c) => ({ kind: 'concept', id: c.id, order: c.order ?? 0, concept: c }))
    const ps: TreeNode[] = paths
      .filter((p) => effectiveParent(p.folderId ?? null) === parentId)
      .map((p) => ({ kind: 'path', id: p.id, order: p.order ?? 0, path: p }))
    return [...fs, ...cs, ...ps].sort((a, b) => a.order - b.order)
  }

  /** Wszystkie widoczne wiersze po kolei — po tej liście chodzi Shift. */
  const widoczneWiersze = (): TreeNode[] => {
    const out: TreeNode[] = []
    const zejdz = (parentId: string | null) => {
      for (const n of children(parentId)) {
        out.push(n)
        if (n.kind === 'folder' && expanded.has(n.id)) zejdz(n.id)
        if (n.kind === 'path' && expanded.has(n.id)) {
          for (const c of kafelkiSciezki(n.path)) {
            out.push({ kind: 'concept', id: c.id, order: c.order ?? 0, concept: c })
          }
        }
      }
    }
    zejdz(null)
    return out
  }

  /** Klik w wiersz z klawiszem: Ctrl dokłada, Shift bierze zakres.
   *  Zwraca true, jeśli obsłużył klik — wtedy nie otwieramy kafelka. */
  const klikZaznaczeniem = (e: React.MouseEvent, id: string): boolean => {
    if (e.ctrlKey || e.metaKey) {
      setZaznaczone((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      kotwicaRef.current = id
      return true
    }
    if (e.shiftKey && kotwicaRef.current) {
      const lista = widoczneWiersze().map((n) => n.id)
      const a = lista.indexOf(kotwicaRef.current)
      const b = lista.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [od, doo] = a <= b ? [a, b] : [b, a]
        setZaznaczone(new Set(lista.slice(od, doo + 1)))
        return true
      }
    }
    // zwykły klik czyści zaznaczenie i otwiera rzecz
    kotwicaRef.current = id
    setZaznaczone(new Set())
    return false
  }

  /** Ładunek przeciągania: całe zaznaczenie, jeśli ciągniemy jego część. */
  const ladunek = (kind: 'concept' | 'folder' | 'path', id: string): DragPayload => {
    if (!zaznaczone.has(id) || zaznaczone.size < 2) return { kind, id }
    const kolejnosc = widoczneWiersze().filter((n) => zaznaczone.has(n.id))
    return { kind: 'wiele', items: kolejnosc.map((n) => ({ kind: n.kind, id: n.id })) }
  }

  const persistExpanded = (next: Set<string>) => {
    localStorage.setItem(EXP_KEY, JSON.stringify([...next]))
    return next
  }

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return persistExpanded(next)
    })
  }

  /** Czy folder `candidateId` leży wewnątrz folderu `ancestorId` (dowolnie głęboko). */
  const isInside = (candidateId: string | null, ancestorId: string): boolean => {
    let cur = candidateId ? folders.find((f) => f.id === candidateId) : undefined
    while (cur) {
      if (cur.id === ancestorId || cur.parentId === ancestorId) return true
      cur = folders.find((f) => f.id === cur!.parentId)
    }
    return false
  }

  const clearHints = () => {
    setDropHint(null)
    setRootHint(false)
  }

  /** Rozkłada ładunek na pojedyncze rzeczy — reszta kodu nie musi wiedzieć,
   *  czy ciągnięto jedną, czy dziesięć. */
  const pozycje = (p: DragPayload) => (p.kind === 'wiele' ? p.items : [p])

  /** Przenosi ładunek do wnętrza folderu (na koniec). */
  const dropInto = async (payload: DragPayload, folderId: string) => {
    for (const it of pozycje(payload)) {
      if (it.kind === 'concept') await moveConcept(it.id, folderId)
      else if (it.kind === 'path') await movePath(it.id, folderId)
      else if (it.id !== folderId && !isInside(folderId, it.id)) {
        await moveFolder(it.id, folderId)
      }
    }
    setZaznaczone(new Set())
    setExpanded((prev) => persistExpanded(new Set(prev).add(folderId)))
  }

  /** Ustawia ładunek przed/po elemencie docelowym (wspólna kolejność).
   *  Przy wielu rzeczach zachowuje ich wzajemną kolejność — dlatego numery
   *  porządkowe rozdzielamy równo w wolnej przerwie, a nie połówkami. */
  const dropRelative = async (
    payload: DragPayload,
    target: TreeNode,
    parentId: string | null,
    pos: 'before' | 'after',
  ) => {
    const items = pozycje(payload).filter((it) => it.id !== target.id)
    if (items.length === 0) return
    if (items.some((it) => it.kind === 'folder' && parentId !== null && isInside(parentId, it.id))) {
      return
    }
    const siblings = children(parentId)
    const i = siblings.findIndex((n) => n.id === target.id)
    let od: number
    let doo: number
    if (pos === 'before') {
      od = siblings[i - 1]?.order ?? target.order - 1
      doo = target.order
    } else {
      od = target.order
      doo = siblings[i + 1]?.order ?? target.order + 1
    }
    const krok = (doo - od) / (items.length + 1)
    let k = 1
    for (const it of items) {
      const order = od + krok * k++
      if (it.kind === 'concept') await moveConcept(it.id, parentId, order)
      else if (it.kind === 'path') await movePath(it.id, parentId, order)
      else await moveFolder(it.id, parentId, order)
    }
    setZaznaczone(new Set())
  }

  /** Upuszczenie na ścieżkę: kafelki się do niej przeprowadzają, jak do folderu. */
  const doSciezki = async (payload: DragPayload, pathId: string) => {
    for (const it of pozycje(payload)) {
      if (it.kind === 'concept') {
        await wlozDoFolderuSciezki(pathId, it.id, dlg.confirm, { naKoniec: true })
      }
    }
    setZaznaczone(new Set())
    setExpanded((prev) => persistExpanded(new Set(prev).add(pathId)))
  }

  const dropOnRoot = async (payload: DragPayload) => {
    for (const it of pozycje(payload)) {
      if (it.kind === 'concept') await moveConcept(it.id, null)
      else if (it.kind === 'path') await movePath(it.id, null)
      else await moveFolder(it.id, null)
    }
    setZaznaczone(new Set())
  }

  /** Rozwija folder, żeby świeżo utworzona rzecz była od razu widoczna. */
  const revealFolder = (parentId: string | null) => {
    if (parentId) setExpanded((prev) => persistExpanded(new Set(prev).add(parentId)))
  }

  const handleNew = async (parentId: string | null = null) => {
    const id = await createConcept()
    if (parentId) await moveConcept(id, parentId)
    revealFolder(parentId)
    onSelect(id)
  }

  const handleNewFolder = (parentId: string | null = null) =>
    setDialog({
      title: 'Nowy folder',
      name: '',
      placeholder: 'Nazwa folderu…',
      fallbackIcon: 'folderZwykly',
      onSave: async (name, icon, iconColor) => {
        await createFolder('concepts', name, parentId)
        // świeżo utworzony folder to ostatni o tej nazwie w tym rodzicu
        const swiezy = (await db.folders.where('kind').equals('concepts').toArray())
          .filter((f) => (f.parentId ?? null) === parentId && f.name === name)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .at(-1)
        if (swiezy && (icon || iconColor)) await updateFolder(swiezy.id, { icon, iconColor })
        revealFolder(parentId)
      },
    })

  const handleNewPath = (parentId: string | null = null) =>
    setDialog({
      title: 'Nowa ścieżka',
      name: '',
      placeholder: 'Nazwa ścieżki (skryptu nauki)…',
      fallbackIcon: 'sciezka',
      onSave: async (name, icon, iconColor) => {
        const id = await createPath(name)
        if (icon || iconColor) await updatePath(id, { icon, iconColor })
        if (parentId) await movePath(id, parentId)
        revealFolder(parentId)
        onOpenPath(id)
      },
    })

  const handleRenamePath = (p: LearningPath) =>
    setDialog({
      title: 'Ścieżka',
      name: p.name,
      icon: p.icon,
      iconColor: p.iconColor,
      iconText: p.iconText,
      fallbackIcon: 'sciezka',
      onSave: (name, icon, iconColor, iconText) =>
        updatePath(p.id, { name, icon, iconColor, iconText }),
    })

  const handleDeletePath = async (p: LearningPath) => {
    // Przykłady zrobione w środku nie mają domu poza tą ścieżką — trzeba
    // powiedzieć, dokąd trafią, bo inaczej wygląda to na kasowanie ich razem.
    const wlasne = await conceptsOwnedByPath(p.id)
    const ok = await dlg.confirm({
      title: `Usunąć ścieżkę „${p.name}"?`,
      message:
        'Kafelki zostają w bazie — znika tylko sposób ich ułożenia.' +
        (wlasne.length
          ? ` Przykłady zrobione w tej ścieżce (${wlasne.length}) wrócą do listy po lewej.`
          : ''),
      confirmLabel: 'Usuń ścieżkę',
      danger: true,
    })
    if (ok) await deletePath(p.id)
  }

  const handleRenameFolder = (f: Folder) =>
    setDialog({
      title: 'Folder',
      name: f.name,
      icon: f.icon,
      iconColor: f.iconColor,
      iconText: f.iconText,
      fallbackIcon: 'folderZwykly',
      onSave: (name, icon, iconColor, iconText) =>
        updateFolder(f.id, { name, icon, iconColor, iconText }),
    })

  const handleDeleteFolder = async (f: Folder) => {
    const ok = await dlg.confirm({
      title: `Usunąć folder „${f.name}"?`,
      message: 'Zawartość przejdzie poziom wyżej — nic z niej nie ginie.',
      confirmLabel: 'Usuń folder',
      danger: true,
    })
    if (ok) await deleteFolder(f.id)
  }

  // -------------------------------------------------------------------------
  // Wiersze drzewa
  // -------------------------------------------------------------------------

  const handleRenameConcept = (c: Concept) =>
    setDialog({
      title: 'Kafelek',
      name: c.name,
      icon: c.icon,
      iconColor: c.iconColor,
      iconText: c.iconText,
      fallbackIcon: 'file-text',
      // bez własnego znaczka kafelek pokazuje plakietkę rodzaju — i to ją
      // ma widać w okienku, a nie zastępczą kartkę
      plakietka: { skrot: typy.short(c.type), kolor: typy.def(c.type).color },
      onSave: (name, icon, iconColor, iconText) =>
        updateConcept(c.id, { name, icon, iconColor, iconText }),
    })

  const handleDeleteConcept = async (c: Concept) => {
    const ok = await dlg.confirm({
      title: `Usunąć kafelek „${c.name}"?`,
      message:
        'Znikną wszystkie jego wersje, strony i powiązania. Tego nie da się cofnąć.',
      confirmLabel: 'Usuń kafelek',
      danger: true,
    })
    if (ok) await deleteConcept(c.id)
  }

  /** `sciezka`: kafelek stoi w rozwiniętej ścieżce — upuszczone na niego
   *  rzeczy też do niej wchodzą. */
  const conceptRow = (
    c: Concept,
    parentId: string | null,
    node: TreeNode,
    sciezka?: LearningPath,
  ) => {
    const hint = dropHint?.id === c.id ? dropHint.pos : null
    return (
      <li key={c.id}>
        <div
          draggable
          className={`concept-item ${c.id === selectedId ? 'selected' : ''} ${
            zaznaczone.has(c.id) ? 'zaznaczony' : ''
          } ${hint === 'before' ? 'drop-before' : hint === 'after' ? 'drop-after' : ''}`}
          onClick={(e) => {
            if (!klikZaznaczeniem(e, c.id)) onSelect(c.id)
          }}
          onContextMenu={(e) => openItemMenu(e, { kind: 'concept', concept: c })}
          onDragStart={(e) => setDragData(e, ladunek('concept', c.id))}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
            setDropHint({ id: c.id, pos })
            setRootHint(false)
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const p = getDragData(e)
            const pos = dropHint?.id === c.id && dropHint.pos !== 'into' ? dropHint.pos : 'after'
            clearHints()
            if (p && sciezka) doSciezki(p, sciezka.id)
            else if (p) dropRelative(p, node, parentId, pos)
          }}
        >
          {c.iconText ? (
            <span
              className="type-mini"
              data-typ={c.type}
              style={{ ...typy.style(c.type), ...tloPlakietki(c.iconColor) }}
              title={typy.label(c.type)}
            >
              {c.iconText}
            </span>
          ) : isIconName(c.icon) ? (
            <span
              className="tree-icon"
              data-typ={c.type}
              style={{ ...typy.style(c.type), ...barwa(c.iconColor) }}
              title={typy.label(c.type)}
            >
              <Icon name={c.icon} size={1.05} />
            </span>
          ) : (
            <span
              className="type-mini"
              data-typ={c.type}
              style={typy.style(c.type)}
              title={typy.label(c.type)}
            >
              {typy.short(c.type)}
            </span>
          )}
          <span className="concept-name">{c.name}</span>
          {/* bez piórka i krzyżyka pod kursorem — te same rzeczy siedzą pod
              prawym przyciskiem, a tam mają nazwy zamiast znaczków */}
        </div>
      </li>
    )
  }

  const folderRow = (f: Folder, parentId: string | null, node: TreeNode) => {
    const isOpen = expanded.has(f.id)
    const hint = dropHint?.id === f.id ? dropHint.pos : null
    const kids = children(f.id)
    return (
      <li key={f.id}>
        <div
          draggable
          className={`folder-row ${zaznaczone.has(f.id) ? 'zaznaczony' : ''} ${hint === 'into' ? 'drop-into' : ''} ${
            hint === 'before' ? 'drop-before' : hint === 'after' ? 'drop-after' : ''
          }`}
          onClick={(e) => {
            if (!klikZaznaczeniem(e, f.id)) toggleExpanded(f.id)
          }}
          onContextMenu={(e) => openItemMenu(e, { kind: 'folder', folder: f })}
          onDragStart={(e) => setDragData(e, ladunek('folder', f.id))}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // strefy: górne 30% = przed, dolne 30% = po, środek = do środka
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const pos =
              y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'into'
            setDropHint({ id: f.id, pos })
            setRootHint(false)
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const p = getDragData(e)
            const pos = dropHint?.id === f.id ? dropHint.pos : 'into'
            clearHints()
            if (!p) return
            if (pos === 'into') dropInto(p, f.id)
            else dropRelative(p, node, parentId, pos)
          }}
        >
          {/* Własny znaczek siada dokładnie tam, gdzie stoi strzałka — czyli
              nad prowadnicą rozwiniętego folderu. Bez znaczka zostaje
              strzałka, bo bez niej nie byłoby wiadomo, że to się rozwija. */}
          {f.iconText ? (
            <span
              className="folder-chevron folder-icon type-mini"
              style={tloPlakietki(f.iconColor)}
            >
              {f.iconText}
            </span>
          ) : isIconName(f.icon) ? (
            <span className="folder-chevron folder-icon" style={barwa(f.iconColor)}>
              <Icon name={f.icon} size={1.05} />
            </span>
          ) : (
            <span className={`folder-chevron ${isOpen ? 'open' : ''}`}>
              <Icon name="rozwin" size={0.95} />
            </span>
          )}
          <span className="folder-name">{f.name}</span>
          <span className="folder-count">{kids.length}</span>
        </div>
        {isOpen && (
          <ul className="folder-children" data-folder={f.id}>
            {kids.length === 0 && <li className="folder-empty">pusty</li>}
            {kids.map((n) => renderNode(n, f.id))}
          </ul>
        )}
      </li>
    )
  }

  const pathRow = (p: LearningPath, parentId: string | null, node: TreeNode) => {
    const hint = dropHint?.id === p.id ? dropHint.pos : null
    const isOpen = expanded.has(p.id)
    const kids = kafelkiSciezki(p)
    return (
      <li key={p.id}>
        <div
          draggable
          className={`concept-item path-item ${zaznaczone.has(p.id) ? 'zaznaczony' : ''} ${p.id === openPathId ? 'selected' : ''} ${
            hint === 'before'
              ? 'drop-before'
              : hint === 'after'
                ? 'drop-after'
                : hint === 'into'
                  ? 'drop-into'
                  : ''
          }`}
          onClick={(e) => {
            if (!klikZaznaczeniem(e, p.id)) onOpenPath(p.id)
          }}
          onContextMenu={(e) => openItemMenu(e, { kind: 'path', path: p })}
          onDragStart={(e) => setDragData(e, ladunek('path', p.id))}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            // Ścieżka zachowuje się jak folder: upuszczony na nią kafelek
            // wchodzi do środka, a same krawędzie zmieniają kolejność listy.
            // Pole „do środka" jest szerokie, bo o to chodzi dziewięć razy
            // na dziesięć — celowanie w kilkanaście pikseli było za trudne.
            const pos =
              y < rect.height * 0.2 ? 'before' : y > rect.height * 0.8 ? 'after' : 'into'
            setDropHint({ id: p.id, pos })
            setRootHint(false)
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const pl = getDragData(e)
            const pos = dropHint?.id === p.id ? dropHint.pos : 'after'
            clearHints()
            if (!pl) return
            if (pos === 'into') {
              doSciezki(pl, p.id)
              return
            }
            dropRelative(pl, node, parentId, pos)
          }}
        >
          {p.iconText ? (
            <span
              className="type-mini"
              style={tloPlakietki(p.iconColor ?? 'var(--accent)')}
              title="Ścieżka nauki"
            >
              {p.iconText}
            </span>
          ) : (
            <span
              className="tree-icon type-path"
              style={barwa(p.iconColor)}
              title="Ścieżka nauki"
            >
              <Icon name={isIconName(p.icon) ? p.icon : 'sciezka'} size={1.05} />
            </span>
          )}
          <span className="concept-name">{p.name}</span>
          <button
            className={`sciezka-rozwin ${isOpen ? 'open' : ''}`}
            title={isOpen ? 'Zwiń kafelki tej ścieżki' : 'Pokaż kafelki, które mieszkają w tej ścieżce'}
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded(p.id)
            }}
          >
            <span className="folder-count">{kids.length}</span>
            <Icon name="rozwin" size={0.9} />
          </button>
        </div>
        {isOpen && (
          <ul className="folder-children sciezka-dzieci" data-sciezka={p.id}>
            {kids.length === 0 && <li className="folder-empty">nic tu nie mieszka</li>}
            {kids.map((c) =>
              conceptRow(c, null, { kind: 'concept', id: c.id, order: c.order ?? 0, concept: c }, p),
            )}
          </ul>
        )}
      </li>
    )
  }

  // -------------------------------------------------------------------------
  // Kopiowanie i wklejanie kafelków
  // -------------------------------------------------------------------------

  /** Co kopiuje Ctrl+C: zaznaczone kafelki, a bez zaznaczenia otwarty kafelek. */
  const doKopii = (): string[] => {
    const znane = new Set([...concepts, ...tutejsze].map((c) => c.id))
    const kolejno = widoczneWiersze()
      .filter((n) => n.kind === 'concept' && zaznaczone.has(n.id))
      .map((n) => n.id)
    const ids = [...new Set([...kolejno, ...zaznaczone])].filter((id) => znane.has(id))
    if (ids.length) return ids
    return !openPathId && selectedId && znane.has(selectedId) ? [selectedId] : []
  }

  /** Dokąd wkleić bez otwartej ścieżki: tam, gdzie ostatnio kliknięto. */
  const wklejBezSciezki = async (ids: string[]) => {
    const k = kotwicaRef.current
    const kafelek = [...concepts, ...tutejsze].find((c) => c.id === k)
    const sciezka = paths.find((p) => p.id === k)?.id ?? kafelek?.pathId
    let nowe: string[]
    if (sciezka) {
      nowe = await wklejKopie(ids, { folderId: null, pathId: sciezka })
      for (const id of nowe) await addConceptToPath(sciezka, id)
      setExpanded((prev) => persistExpanded(new Set(prev).add(sciezka)))
    } else {
      const folderId = folders.some((f) => f.id === k) ? k : effectiveParent(kafelek?.folderId ?? null)
      nowe = await wklejKopie(ids, { folderId })
      revealFolder(folderId)
    }
    setZaznaczone(new Set(nowe))
    pokaz(`Wklejono ${odmien(nowe.length, 'kafelek', 'kafelki', 'kafelków')}`)
  }

  const schowekRef = useRef({
    doKopii,
    wklejBezSciezki,
    openPathId,
    label: typy.label,
    usunZaznaczone,
    ileZaznaczonych: zaznaczone.size,
  })
  schowekRef.current = {
    doKopii,
    wklejBezSciezki,
    openPathId,
    label: typy.label,
    usunZaznaczone,
    ileZaznaczonych: zaznaczone.size,
  }

  useEffect(() => {
    const klawisz = (e: KeyboardEvent) => {
      // Delete usuwa zaznaczenie z listy (po pytaniu), o ile nie pisze się tekstu
      if (e.key === 'Delete' && !e.defaultPrevented && schowekRef.current.ileZaznaczonych > 0) {
        if (piszeTekst(e.target)) return
        e.preventDefault()
        void schowekRef.current.usunZaznaczone()
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c' || e.defaultPrevented) return
      if (piszeTekst(e.target)) return
      const ids = schowekRef.current.doKopii()
      if (!ids.length) return
      e.preventDefault()
      kopiujKafelki(ids, schowekRef.current.label)
        .then((n) => pokaz(`Skopiowano ${odmien(n, 'kafelek', 'kafelki', 'kafelków')}`))
        .catch(() => pokaz('Nie udało się skopiować — przeglądarka nie dała dostępu do schowka'))
    }
    const wklej = (e: ClipboardEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return
      const ids = kafelkiZeSchowka(e.clipboardData?.getData('text/plain') ?? '')
      if (!ids) return
      e.preventDefault()
      // otwarta ścieżka sama wie, gdzie stoi zaznaczone miejsce
      if (schowekRef.current.openPathId) {
        window.dispatchEvent(new CustomEvent(WKLEJ_DO_SCIEZKI, { detail: ids }))
        pokaz(`Wklejono ${odmien(ids.length, 'kafelek', 'kafelki', 'kafelków')} do ścieżki`)
      } else void schowekRef.current.wklejBezSciezki(ids)
    }
    window.addEventListener('keydown', klawisz)
    document.addEventListener('paste', wklej)
    return () => {
      window.removeEventListener('keydown', klawisz)
      document.removeEventListener('paste', wklej)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renderNode = (n: TreeNode, parentId: string | null) =>
    n.kind === 'folder'
      ? folderRow(n.folder, parentId, n)
      : n.kind === 'path'
        ? pathRow(n.path, parentId, n)
        : conceptRow(n.concept, parentId, n)

  // Widok płaski przy szukaniu / filtrze typu.
  const pasuje = (tekst: string) => {
    const q = search.trim().toLowerCase()
    return !q || tekst.toLowerCase().includes(q)
  }
  const flatList = (chceTutejsze ? tutejsze : concepts)
    .filter((c) => {
      // same ścieżki w filtrze = kafelków nie pokazujemy wcale
      if (wybraneRodzaje.size > 0 && !wybraneRodzaje.has(c.type)) return false
      if (wybraneRodzaje.size === 0 && chceSciezki && !chceTutejsze) return false
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // Ścieżki: wybrane w filtrze pokazują się wszystkie, a bez filtru — te,
  // których nazwa pasuje do szukanego słowa.
  const flatPaths = chceSciezki
    ? paths.filter((p) => pasuje(p.name))
    : wybraneTypy.size > 0
      ? []
      : paths.filter((p) => search.trim() !== '' && pasuje(p.name))

  return (
    <aside className="sidebar">
      <div className="sidebar-filters">
        <Icon name="szukaj" size={0.95} />
        <input
          ref={szukajRef}
          className="input"
          type="search"
          placeholder="Szukaj kafelków, ścieżek…"
          title="Szukaj kafelków i ścieżek po nazwie lub tagu"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearch('')
              e.currentTarget.blur()
            }
          }}
        />
        <kbd className="sidebar-klawisz">Ctrl K</kbd>
      </div>

      {/* wybór wielokrotny: rodzaje się sumują, „Wszystko" czyści */}
      <div className="sidebar-chipy">
        <button
          className={`sidebar-chip ${wybraneTypy.size === 0 ? 'active' : ''}`}
          onClick={() => setWybraneTypy(new Set())}
        >
          Wszystko
        </button>
        {rodzajeNaLiscie.map((t) => (
          <button
            key={t.id}
            className={`sidebar-chip ${wybraneTypy.has(t.id) ? 'active' : ''}`}
            title={t.label}
            onClick={() => przelaczTyp(t.id)}
          >
            {t.short}
          </button>
        ))}
        <button
          className={`sidebar-chip ${chceSciezki ? 'active' : ''}`}
          onClick={() => przelaczTyp(SCIEZKI)}
        >
          Ścieżki
        </button>
        {tutejsze.length > 0 && (
          <button
            className={`sidebar-chip ${chceTutejsze ? 'active' : ''}`}
            title="Kafelki mieszkające w ścieżkach"
            onClick={() => przelaczTyp(TUTEJSZE)}
          >
            Tutejsze {tutejsze.length}
          </button>
        )}
      </div>

      {/* tworzenie — tuż nad drzewem, bo dotyczy jego zawartości */}
      <div className="sidebar-create">
        <button
          className="sidebar-create-btn"
          title="Nowy kafelek"
          onClick={() => handleNew()}
        >
          + Kafelek
        </button>
        <button
          className="sidebar-create-btn"
          title="Nowa ścieżka (materiał do nauki)"
          onClick={() => handleNewPath()}
        >
          + Ścieżka
        </button>
        <button
          className="sidebar-create-btn sidebar-create-ikona"
          title="Nowy folder"
          onClick={() => handleNewFolder()}
        >
          <Icon name="folder" />
        </button>
      </div>

      {filtering ? (
        <ul className="concept-list" onContextMenu={openMenu}>
          {flatList.length === 0 && flatPaths.length === 0 && (
            <li className="concept-empty">Nic nie pasuje do filtra.</li>
          )}
          {flatList.map((c) =>
            conceptRow(c, c.folderId ?? null, {
              kind: 'concept',
              id: c.id,
              order: c.order ?? 0,
              concept: c,
            }),
          )}
          {flatPaths.map((p) =>
            pathRow(p, p.folderId ?? null, {
              kind: 'path',
              id: p.id,
              order: p.order ?? 0,
              path: p,
            }),
          )}
        </ul>
      ) : (
        <ul
          className={`concept-list ${rootHint ? 'drop-root' : ''}`}
          onContextMenu={openMenu}
          onDragOver={(e) => {
            e.preventDefault()
            setDropHint(null)
            setRootHint(true)
          }}
          onDragLeave={() => setRootHint(false)}
          onDrop={(e) => {
            e.preventDefault()
            const p = getDragData(e)
            clearHints()
            if (p) dropOnRoot(p)
          }}
        >
          {folders.length === 0 && concepts.length === 0 && (
            <li className="concept-empty">Brak kafelków. Utwórz pierwszy!</li>
          )}
          {children(null).map((n) => renderNode(n, null))}
        </ul>
      )}

      {dialog && (
        <NameDialog
          title={dialog.title}
          name={dialog.name}
          icon={dialog.icon}
          // bez tego okienko otwierało się z domyślną barwą, choć znaczek
          // w drzewie miał już swoją
          iconColor={dialog.iconColor}
          iconText={dialog.iconText}
          fallbackIcon={dialog.fallbackIcon}
          plakietka={dialog.plakietka}
          placeholder={dialog.placeholder}
          onSave={dialog.onSave}
          onClose={() => setDialog(null)}
        />
      )}

      {/* menu spod prawego przycisku — tworzenie albo działania na rzeczy */}
      {menu && (
        <div
          ref={menuRef}
          className="tree-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.cel.kind === 'tlo' ? (
            <>
              <div className="tree-menu-where">
                {menu.cel.parentId
                  ? `w folderze „${
                      folders.find((f) => f.id === menuParent)?.name ?? ''
                    }"`
                  : 'na poziomie głównym'}
              </div>
              {menuItem('kafelek', 'Nowy kafelek', () => handleNew(menuParent))}
              {menuItem('folder', 'Nowy folder', () => handleNewFolder(menuParent))}
              {menuItem('sciezka', 'Nowa ścieżka', () => handleNewPath(menuParent))}
            </>
          ) : (
            <>
              {/* bez nagłówka z nazwą: widać ją w wierszu, na który się
                  kliknęło, a w menu tylko rozpychała się na trzy linijki */}
              {menuItem('edycja', 'Zmień nazwę', handleMenuRename)}
              {menuItem(
                'kopia',
                menu.cel.kind === 'folder' ? 'Powiel z zawartością' : 'Powiel',
                handleMenuDuplicate,
              )}
              {/* Wkładanie do ścieżki bez celowania myszą. Upuszczenie na
                  wiersz ścieżki działa, ale trzeba trafić w jego środek —
                  a to kilkanaście pikseli. Tu się po prostu wybiera. */}
              {menu.cel.kind === 'concept' && paths.length > 0 && (
                <div
                  className={`tree-menu-podmenu ${
                    rozwiniete === 'sciezka' ? 'otwarte' : ''
                  }`}
                >
                  <button
                    className="tree-menu-item tree-menu-rozwija"
                    type="button"
                    aria-expanded={rozwiniete === 'sciezka'}
                    onClick={() =>
                      setRozwiniete((r) => (r === 'sciezka' ? null : 'sciezka'))
                    }
                  >
                    <span>
                      <Icon name="sciezka" size={1} /> Włóż do ścieżki
                    </span>
                    <span className="tree-menu-strzalka">›</span>
                  </button>
                  <div className="tree-menu tree-menu-boczne">
                    {paths.map((p) => (
                      <button
                        key={p.id}
                        className="tree-menu-item"
                        onClick={() => {
                          setMenu(null)
                          wlozDoSciezki(p.id)
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="tree-menu-sep" />
              {menuItem(
                'usun',
                naGrupie ? `Usuń zaznaczone (${zaznaczone.size})` : 'Usuń',
                handleMenuDelete,
                true,
              )}
            </>
          )}
        </div>
      )}
      {komunikat && (
        <div className="sidebar-komunikat" role="status">
          {komunikat}
        </div>
      )}
      {/* dół: rzeczy dotyczące całej aplikacji, nie zawartości drzewa */}
      <footer className="sidebar-footer">
        {/* Data zbudowania paczki. Wygląda na drobiazg, ale bez niej każda
            rozmowa o „nie działa" zaczyna się od zgadywania, czy urządzenie
            ma nową wersję, czy trzyma starą kopię. */}
        <span className="wersja-budowy" title="Wersja programu (data zbudowania)">
          wersja {__WERSJA__}
        </span>
        <button
          className={`sidebar-foot-btn ${graphActive ? 'active' : ''}`}
          title="Graf powiązań"
          onClick={onToggleGraph}
        >
          <Icon name="graf" />
          <span>Graf powiązań</span>
        </button>
        <span className="sidebar-counts" title="Liczba kafelków i ścieżek">
          {odmien(concepts.length, 'kafelek', 'kafelki', 'kafelków')} ·{' '}
          {odmien(paths.length, 'ścieżka', 'ścieżki', 'ścieżek')}
        </span>
        <button
          className="sidebar-foot-btn"
          title="Ustawienia"
          onClick={onOpenSettings}
        >
          <Icon name="ustawienia" />
          {/* Na telefonie to jedyne wejście do pobierania notatek z komputera,
              więc nie może być bezimienną ikonką w rogu. Na dużym ekranie
              podpis chowamy — tam stopka ma być wąska. */}
          <span className="tylko-telefon">Ustawienia</span>
        </button>
      </footer>
    </aside>
  )
}
