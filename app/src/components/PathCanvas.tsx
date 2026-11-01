import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  getBezierPath,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import { createPortal } from 'react-dom'
import '@xyflow/react/dist/style.css'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { mdShortcuts, surroundSelection, wrapLines } from '../cmShortcuts'
import { wikiCompletion } from '../cmWiki'
import { RichEditor, RichToolbar } from './RichEditor'
import { ROZDZIAL_MAX, ROZDZIAL_MIN, ROZDZIAL_ROZMIARY } from '../uiSettings'
import type { Editor } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createConcept,
  db,
  keepConceptInPath,
  przypnijTekstDoWersji,
  releaseConceptToLibrary,
  updateConcept,
  updatePath,
  updateSubpage,
  updateVersion,
  wyslijDoBiblioteki,
} from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { ScriptBody } from './ScriptView'
import { SubpageTabs } from './SubpageTabs'
import { BlockShell } from './BlockShell'
import { GroupShell } from './GroupShell'
import { Outline, outlineId, pozycjeSpisu, stylRozdzialu } from './Outline'
import { KontekstKafelka } from './KontekstKafelka'
import { ConceptPicker } from './ConceptPicker'
import { Icon } from './Icon'
import { Komponowanie } from './Komponowanie'
import {
  RELATION_LABELS,
  isSymmetricRelation,
  kluczWlasnej,
  type BlockType,
  type BlockVersion,
  type Concept,
  type FusionPart,
  type PathEdge,
  type PasekStron,
  type PathNode,
  type SourceRef,
  type StronaBloku,
  type Subpage,
  type WlasneTresci,
} from '../types'
import { useBlockTypes } from '../blockTypes'
import { useDialogs } from './Dialogs'

const MIME = 'text/x-kompendium'
/** Przeciąganie segmentów w trybie liniowym. */
const SEG_MIME = 'text/x-komp-seg'

interface CanvasApi {
  updateData: (id: string, patch: Record<string, unknown>) => void
  unfuse: (id: string) => void | Promise<void>
  renameFusion: (id: string) => void
  addFusionPart: (id: string) => void
  removeFusionPart: (id: string, index: number) => void
  setPartVersion: (id: string, index: number, versionId: string | null) => void
  openConcept: (id: string) => void
  /** Numer i liczba strzałek wychodzących z tego samego źródła. */
  edgeOrderInfo: (edgeId: string, source: string) => { index: number; count: number }
  /** Przestawia strzałkę o jedną pozycję wcześniej (z zawinięciem na koniec). */
  cycleEdgePriority: (edgeId: string) => void
}

const CanvasCtx = createContext<CanvasApi>(null!)

/** Strzałki z tego samego źródła w efektywnej kolejności: jawny priorytet,
 *  a bez niego pozycja celu na mapie (y, potem x). Poza komponentem, żeby
 *  akcje kafelków mogły mieć stałą tożsamość. */
const siblingsSorted = (source: string, edges: Edge[], nodes: Node[]) => {
  const pos = (id: string) => nodes.find((n) => n.id === id)?.position ?? { x: 0, y: 0 }
  return edges
    .filter((e) => e.source === source)
    .sort((a, b) => {
      const pa = (a.data?.priority as number | undefined) ?? Infinity
      const pb = (b.data?.priority as number | undefined) ?? Infinity
      if (pa !== pb) return pa - pb
      const ta = pos(a.target)
      const tb = pos(b.target)
      return ta.y - tb.y || ta.x - tb.x
    })
}

// ---------------------------------------------------------------------------
// Konwersje: nasz format <-> React Flow
// ---------------------------------------------------------------------------

const toRfNode = (n: PathNode): Node => ({
  id: n.id,
  type: n.kind,
  position: { x: n.x, y: n.y },
  data:
    n.kind === 'block'
      ? {
          conceptId: n.conceptId,
          versionId: n.versionId,
          subpageId: n.subpageId ?? null,
          // to, co ścieżka ma własnego: nazwa kafelka i napisany tutaj tekst
          nazwa: n.nazwa,
          wlasneTresci: n.wlasneTresci,
        }
      : n.kind === 'text'
        ? { text: n.text }
        : n.kind === 'comment'
          ? { text: n.text, side: n.side }
          : n.kind === 'heading'
            ? { text: n.text, level: n.level, rozmiar: n.rozmiar }
            : {
                name: n.name,
                // materiały: z czego złożono — zostają, żeby dało się wrócić
                parts: n.parts,
                type: n.type,
                content: n.content,
                strony: n.strony,
                zrodla: n.zrodla,
                // pole ze starego modelu: nie używamy go, ale i nie kasujemy
                paskiStron: n.paskiStron,
              },
})

const fromRfNode = (n: Node): PathNode => {
  const base = { id: n.id, x: n.position.x, y: n.position.y }
  if (n.type === 'block') {
    return {
      ...base,
      kind: 'block',
      conceptId: n.data.conceptId as string,
      versionId: (n.data.versionId as string | null) ?? null,
      subpageId: (n.data.subpageId as string | null) ?? null,
      nazwa: n.data.nazwa as string | undefined,
      wlasneTresci: n.data.wlasneTresci as WlasneTresci | undefined,
    }
  }
  if (n.type === 'text') {
    return { ...base, kind: 'text', text: (n.data.text as string) ?? '' }
  }
  if (n.type === 'comment') {
    return {
      ...base,
      kind: 'comment',
      text: (n.data.text as string) ?? '',
      side: (n.data.side as 'left' | 'right' | undefined) ?? undefined,
    }
  }
  if (n.type === 'heading') {
    return {
      ...base,
      kind: 'heading',
      text: (n.data.text as string) ?? '',
      level: ((n.data.level as 1 | 2 | 3) ?? 1),
      ...(n.data.rozmiar ? { rozmiar: n.data.rozmiar as number } : {}),
    }
  }
  return {
    ...base,
    kind: 'fusion',
    name: (n.data.name as string) ?? '',
    type: (n.data.type as BlockType | undefined) ?? undefined,
    parts: (n.data.parts as FusionPart[]) ?? [],
    content: (n.data.content as string | undefined) ?? undefined,
    strony: n.data.strony as StronaBloku[] | undefined,
    zrodla: n.data.zrodla as SourceRef[] | undefined,
    paskiStron: n.data.paskiStron as PasekStron[] | undefined,
  }
}

const toRfEdge = (e: PathEdge): Edge => ({
  id: e.id,
  source: e.from,
  target: e.to,
  type: 'ordered',
  data: { priority: e.priority },
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
})

const fromRfEdge = (e: Edge): PathEdge => ({
  id: e.id,
  from: e.source,
  to: e.target,
  priority: (e.data?.priority as number | undefined) ?? undefined,
})

// ---------------------------------------------------------------------------
// Węzły niestandardowe
// ---------------------------------------------------------------------------

/** Wyrenderowana treść kafelka w osobnym, zmemoizowanym komponencie:
 *  przeciąganie zmienia tylko pozycję, więc React w ogóle nie wchodzi
 *  w to poddrzewo (a jest w nim najdroższa część — wzory KaTeX). */
const NodeBody = memo(function NodeBody({
  html,
  className = 'path-node-body markdown-body',
}: {
  html: string
  className?: string
}) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
})

function BlockNode({ id, data, selected }: NodeProps) {
  const ctx = useContext(CanvasCtx)
  const typy = useBlockTypes()
  const conceptId = data.conceptId as string
  const versionId = (data.versionId as string | null) ?? null
  const subpageId = (data.subpageId as string | null) ?? null
  const concept = useLiveQuery(() => db.concepts.get(conceptId), [conceptId])
  const versions =
    useLiveQuery(
      () => db.versions.where('conceptId').equals(conceptId).toArray(),
      [conceptId],
    ) ?? []
  const version = versionId
    ? versions.find((v) => v.id === versionId)
    : versions.find((v) => v.id === concept?.currentVersionId)
  const subs =
    useLiveQuery(
      () =>
        version
          ? db.subpages
              .where('[conceptId+versionId]')
              .equals([conceptId, version.id])
              .toArray()
          : Promise.resolve([] as Subpage[]),
      [conceptId, version?.id],
    ) ?? []
  const activeSub = subs.find((s) => s.id === subpageId) ?? null

  if (!concept) {
    return (
      <div className={`path-node path-node-missing ${selected ? 'selected' : ''}`}>
        <Handle type="target" position={Position.Top} />
        (usunięte pojęcie)
        <Handle type="source" position={Position.Bottom} />
      </div>
    )
  }

  return (
    <div className={`path-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <header className="path-node-head">
        <span
          className="type-mini"
          data-typ={concept.type}
          style={typy.style(concept.type)}
          title={typy.label(concept.type)}
        >
          {typy.short(concept.type)}
        </span>
        <span className="path-node-name">{concept.name}</span>
        <button
          className="path-node-open nodrag"
          title="Otwórz kafelek w edytorze"
          onClick={() => ctx.openConcept(concept.id)}
        >
          ↗
        </button>
      </header>
      <select
        className="path-node-version nodrag"
        value={versionId ?? ''}
        title="Wersja użyta w tej ścieżce"
        onChange={(e) => ctx.updateData(id, { versionId: e.target.value || null })}
      >
        <option value="">zawsze bieżąca</option>
        {[...versions]
          .sort((a, b) => a.version - b.version)
          .map((v) => (
            <option key={v.id} value={v.id}>
              {v.label ?? `v${v.version}`}
            </option>
          ))}
      </select>
      <SubpageTabs
        conceptId={conceptId}
        versionId={version?.id ?? ''}
        active={subpageId}
        onSelect={(sid) => ctx.updateData(id, { subpageId: sid })}
        hint="Strona pokazywana bazowo przy oglądaniu tej ścieżki"
      />
      <NodeBody
        html={renderMarkdown(activeSub ? activeSub.content : (version?.content ?? ''))}
      />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

/** Wspólny wygląd notatki (tkanka/intuicja) i komentarza — treść renderowana
 *  jak w kafelku (Markdown+LaTeX); edycja przez podwójny klik / menu. */
function NoteBody({
  data,
  selected,
  variant,
}: {
  data: Record<string, unknown>
  selected: boolean | undefined
  variant: 'text' | 'comment'
}) {
  const text = (data.text as string) ?? ''
  const html = text
    ? renderMarkdown(text)
    : '<p class="note-empty">kliknij dwukrotnie, aby edytować…</p>'
  return (
    <div
      className={`path-node path-node-text ${
        variant === 'comment' ? 'path-node-comment' : ''
      } ${selected ? 'selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="path-node-grip" title="Przeciągnij, aby przesunąć">
        {variant === 'comment' ? '💬 komentarz (poza skryptem)' : '✥ notatka'}
      </div>
      <NodeBody html={html} className="path-node-notebody markdown-body" />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const TextNode = ({ data, selected }: NodeProps) => (
  <NoteBody data={data} selected={selected} variant="text" />
)
const CommentNode = ({ data, selected }: NodeProps) => (
  <NoteBody data={data} selected={selected} variant="comment" />
)

/** Krawędź z numerkiem kolejności (widocznym, gdy z kafelka wychodzi >1 strzałka).
 *  Klik w numerek przestawia gałąź o jedną pozycję wcześniej. */
function OrderedEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const ctx = useContext(CanvasCtx)
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const { index, count } = ctx.edgeOrderInfo(id, source)
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd as string} />
      {count > 1 && (
        <EdgeLabelRenderer>
          <button
            className="edge-order nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            title="Kolejność gałęzi w skrypcie — kliknij, aby przestawić wcześniej"
            onClick={() => ctx.cycleEdgePriority(id)}
          >
            {index}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = { ordered: OrderedEdge }

/** Przytrzymuje menu kontekstowe w oknie — przy dolnej albo prawej krawędzi
 *  rozwinęłoby się poza ekran i część pozycji byłaby nieklikalna. */
const clampMenu = (el: HTMLDivElement | null) => {
  if (!el) return
  const pad = 8
  const r = el.getBoundingClientRect()
  if (r.bottom > window.innerHeight - pad) {
    el.style.top = `${Math.max(pad, window.innerHeight - pad - r.height)}px`
  }
  if (r.right > window.innerWidth - pad) {
    el.style.left = `${Math.max(pad, window.innerWidth - pad - r.width)}px`
  }
}

/** Przedrostek id strzałek powiązań — te są tylko pokazywane, nie zapisywane. */
const REL_PREFIX = 'rel-'

const isRelationChange = (c: EdgeChange): boolean => {
  const id =
    'id' in c
      ? c.id
      : 'item' in c
        ? (c.item as { id?: string }).id
        : undefined
  return typeof id === 'string' && id.startsWith(REL_PREFIX)
}

// ---------------------------------------------------------------------------
// Tryb liniowy: pionowe doklejanie segmentów skryptu
// ---------------------------------------------------------------------------

interface LinearViewProps {
  ordered: PathNode[]
  onDropConcept: (conceptId: string, afterId: string | null, beforeId: string | null) => void
  onMoveSegment: (segId: string, afterId: string | null, beforeId: string | null) => void
  /** Przenosi kilka zaznaczonych segmentów naraz, zachowując ich kolejność. */
  onMoveSegments: (ids: string[], afterId: string | null, beforeId: string | null) => void
  onAddNote: (kind: 'text' | 'comment', afterId: string | null, beforeId: string | null) => void
  /** Nowy kafelek rodzaju „mieszka w ścieżce" — poza biblioteką. */
  onAddExample: (typeId: string, afterId: string | null, beforeId: string | null) => void
  /** Paski stron postawione w scalonym bloku — miejsca w tekście. */
  onPaskiStron?: (segId: string, paski: PasekStron[]) => void
  /** Własny podpis zakładki składnika (tylko w tej ścieżce). */
  onEtykietaCzesci?: (segId: string, index: number, etykieta: string | undefined) => void
  /** Ręczne „ten kafelek mieszka tutaj" / „wróć do biblioteki". */
  onKeepHere: (conceptId: string, tutaj: boolean) => void
  onRemove: (id: string) => void
  onEdit: (n: PathNode) => void
  onUnfuse: (id: string) => void
  onToggleSide: (id: string) => void
  onSetSubpage: (segId: string, subpageId: string | null) => void
  onSetVersion: (segId: string, versionId: string | null) => void
  /** Wersja pojedynczego kafelka w grupie. */
  onSetPartVersion: (segId: string, index: number, versionId: string | null) => void
  /** Strona pojedynczego kafelka w grupie. */
  onSetPartSubpage: (segId: string, index: number, subpageId: string | null) => void
  onAddHeading: (level: 1 | 2 | 3, afterId: string | null, beforeId: string | null) => void
  /** Scala segment z następnym (albo dokłada następny do grupy). */
  onGroupWithNext: (segId: string) => void
  /** Scala zaznaczone kafelki — także takie, które nie sąsiadują ze sobą. */
  onFuseSelected: (ids: string[]) => void
  /** Kafelek, do którego trzeba podskoczyć po otwarciu ścieżki. */
  celKlocek?: string | null
  /** Do zapamiętania miejsca czytania — osobno dla każdej ścieżki. */
  pathId: string
  /** Tryb przypominania: treści zakryte, odsłaniane kliknięciem. */
  zakryte?: boolean
  onJumpToSource?: (ref: SourceRef) => void
  onOpenConcept?: (id: string) => void

  // ---- pisanie wprost w ścieżce (Linia jest warsztatem, Skrypt czytelnią) ----
  //
  // Wszystko poniżej zapisuje się W ŚCIEŻCE. Kafelek w bibliotece zostaje
  // nietknięty — ścieżka jest miejscem pracy nad tekstem, a nie zdalnym
  // pilotem do biblioteki.
  /** Nazwa kafelka w tej ścieżce (kafelek zachowuje swoją). */
  onRenameSegment?: (nodeId: string, nazwa: string) => void
  /** Treść kafelka w tej ścieżce, dla danej wersji i strony. */
  onEditBlock?: (
    nodeId: string,
    versionId: string,
    subpageId: string | null,
    md: string,
  ) => void
  /** To samo dla składnika scalonego bloku. */
  /** Tekst kilku składników naraz — z jednego wspólnego pola. */
  onZapisRunu?: (
    nodeId: string,
    zapisy: { i: number; versionId: string; subpageId: string | null; md: string }[],
    paski?: PasekStron[],
  ) => void
  onEditPart?: (
    nodeId: string,
    index: number,
    versionId: string,
    subpageId: string | null,
    md: string,
    /** Przesunięte paski stron — zapisywane razem z tekstem. */
    paski?: PasekStron[],
  ) => void
  /** Porzucenie własnego tekstu — kafelek wraca do pokazywania kafelka. */
  onWrocDoKlocka?: (nodeId: string, versionId: string, subpageId: string | null) => void
  /** Tekst napisany w ścieżce staje się nową wersją kafelka. */
  onWyslijDoBiblioteki?: (
    nodeId: string,
    conceptId: string,
    versionId: string,
    subpageId: string | null,
    tekst: string,
  ) => void
  onWrocDoCzesci?: (
    nodeId: string,
    index: number,
    versionId: string,
    subpageId: string | null,
  ) => void
  onEditNote?: (nodeId: string, md: string) => void
  onEditHeading?: (nodeId: string, text: string) => void
  onPoziomRozdzialu?: (nodeId: string, level: 1 | 2 | 3) => void
  onRozmiarRozdzialu?: (nodeId: string, rozmiar: number | undefined) => void
  onRenameFusion?: (nodeId: string, name: string) => void
  /** Zapis treści złożonego kafelka; brak numeru strony = strona główna. */
  onEditFusion?: (nodeId: string, md: string, stronaId: string | null) => void
}

/** Treść jednego segmentu, przerysowywana tylko wtedy, gdy naprawdę się zmieni.
 *
 *  Zapis treści kafelka budzi żywe zapytania i cała Linia renderuje się od nowa.
 *  Przy sześćdziesięciu kafelkach to było ~300 ms na jeden zapis — widoczne
 *  jako zacięcie, także w środku przewijania. `sygnatura` zbiera wszystko, od
 *  czego zależy wygląd segmentu; jeśli się nie zmieniła, React pomija poddrzewo. */
const TrescSegmentu = memo(
  ({ rysuj }: { sygnatura: string; rysuj: () => React.ReactNode }) => <>{rysuj()}</>,
  (a, b) => a.sygnatura === b.sygnatura,
)

/** Kolejka stawiania pól tekstowych: po jednym na klatkę.
 *
 *  Postawienie pola to sparsowanie Markdownu i narysowanie wzorów — przy
 *  wzorach potrafi to zająć ponad sto milisekund. Kilkanaście pól zbudowanych
 *  w jednej klatce daje zacięcie, które widać; te same pola rozłożone po
 *  klatkach są niezauważalne. Kolejka jest wspólna dla całej Linii. */
/** Zgłoszenie zwraca false, jeśli jeszcze nie pora — wraca wtedy na koniec. */
type ZgloszeniePola = () => boolean
const kolejkaPol: ZgloszeniePola[] = []
let kolejkaBiegnie = false
/** Kiedy widok ostatnio drgnął. Dopóki się rusza, nic nie stawiamy. */
let ostatniRuch = 0
const SPOKOJ = 180
function ruchWidoku() {
  ostatniRuch = performance.now()
  ruszKolejke()
}
function ruszKolejke() {
  if (kolejkaBiegnie || kolejkaPol.length === 0) return
  kolejkaBiegnie = true
  let pominiete = 0
  const krok = () => {
    if (kolejkaPol.length === 0) {
      kolejkaBiegnie = false
      return
    }
    // przewijanie ma pierwszeństwo: czekamy, aż widok przystanie
    if (performance.now() - ostatniRuch < SPOKOJ) {
      requestAnimationFrame(krok)
      return
    }
    // cała kolejka to kafelki daleko od ekranu — nie ma po co kręcić się
    // w kółko, obudzi nas najbliższy ruch widoku
    if (pominiete >= kolejkaPol.length) {
      kolejkaBiegnie = false
      return
    }
    const fn = kolejkaPol.shift()!
    if (fn() === false) {
      kolejkaPol.push(fn)
      pominiete++
    } else {
      pominiete = 0
    }
    requestAnimationFrame(krok)
  }
  requestAnimationFrame(krok)
}
function doKolejki(fn: ZgloszeniePola) {
  kolejkaPol.push(fn)
  ruszKolejke()
}
function zKolejki(fn: ZgloszeniePola) {
  const i = kolejkaPol.indexOf(fn)
  if (i >= 0) kolejkaPol.splice(i, 1)
}
/** Jak daleko od ekranu kafelek dostaje pole. Rysujemy szerzej (żeby przy
 *  przewijaniu nie było pustych miejsc), ale pola — najdroższą rzecz w tym
 *  widoku — stawiamy tylko przy samym ekranie. */
const ZASIEG_POLA = 300

/** Wszystko, co ramka segmentu robi z listą — w jednym, niezmiennym pudełku.
 *  Dzięki temu ramka dostaje te same propsy przy każdym przerysowaniu Linii
 *  i React może ją pominąć. */
interface ApiSegmentu {
  klik: (e: React.MouseEvent, id: string) => void
  nadCiagniete: (e: React.DragEvent, i: number) => void
  upuszczone: (e: React.DragEvent, i: number) => void
  menu: (e: React.MouseEvent, i: number) => void
  chwyt: (e: React.DragEvent, id: string) => void
  scal: (id: string) => void
  rozdziel: (id: string) => void
  usun: (id: string) => void
}

interface RamkaProps {
  n: PathNode
  i: number
  pelny: boolean
  zaznaczony: boolean
  kreska: 'before' | 'after' | null
  wysokosc: number
  /** Czy da się scalić z następnym. To zależy od SĄSIADA, więc musi wejść
   *  propsem — inaczej zapamiętana ramka nie dowiedziałaby się, że ktoś
   *  dołożył kafelek pod nią, i przycisk scalania by się nie pojawił. */
  mozeScalic: boolean
  sygnatura: string
  rysuj: () => React.ReactNode
  api: ApiSegmentu
  pilnuj: (el: HTMLDivElement | null) => (() => void) | void
}

/** Ramka jednego segmentu w Linii.
 *
 *  Wydzielona i zapamiętana, bo inaczej KAŻDA zmiana w widoku — postawienie
 *  pola, przesunięcie okna, mrugnięcie kreski — kazała Reactowi zbudować od
 *  nowa tyle ramek, ile ścieżka ma kafelków. Przy dwóch tysiącach to było
 *  kilkadziesiąt milisekund na każde naciśnięcie klawisza. */
const RamkaSegmentu = memo(
  function RamkaSegmentu({
    n,
    i,
    pelny,
    zaznaczony,
    kreska,
    wysokosc,
    mozeScalic,
    rysuj,
    api,
    pilnuj,
  }: RamkaProps) {
    return (
      <div
        ref={pilnuj}
        data-seg={n.id}
        data-idx={i}
        data-pelny={pelny ? '1' : '0'}
        style={pelny ? undefined : { height: wysokosc, boxSizing: 'border-box' }}
        className={`linear-seg ${n.kind === 'comment' ? 'linear-seg-sidenote' : ''} ${
          zaznaczony ? 'zaznaczony' : ''
        } ${kreska === 'before' ? 'drop-before' : kreska === 'after' ? 'drop-after' : ''}`}
        onClick={(e) => api.klik(e, n.id)}
        onDragOver={(e) => api.nadCiagniete(e, i)}
        onDrop={(e) => api.upuszczone(e, i)}
        onContextMenu={(e) => api.menu(e, i)}
      >
        {pelny && n.kind !== 'comment' && (
          <div className="linear-side">
            <button
              draggable
              className="linear-grip"
              title="Przeciągnij, aby zmienić kolejność"
              onDragStart={(e) => api.chwyt(e, n.id)}
            >
              <Icon name="przesun" size={1.15} />
            </button>
            {/* pióra nie ma: tytuły i treść zmienia się wprost w kafelku,
                a reszta (czym jest grupa, kolor) siedzi pod prawym przyciskiem */}
            {(n.kind === 'block' || n.kind === 'fusion') && mozeScalic && (
              <button
                className="folder-action"
                title={
                  n.kind === 'fusion'
                    ? 'Dołącz następny kafelek do tej grupy'
                    : 'Scal z następnym kafelkiem w jedną grupę'
                }
                onClick={() => api.scal(n.id)}
              >
                ⧉
              </button>
            )}
            {n.kind === 'fusion' && (
              <button
                className="folder-action"
                title="Rozdziel fuzję"
                onClick={() => api.rozdziel(n.id)}
              >
                ⇱
              </button>
            )}
            {/* usuwanie siedzi pod prawym przyciskiem — krzyżyk tuż obok
                uchwytu za łatwo trafiało się przy przeciąganiu */}
          </div>
        )}
        {pelny && <div className="linear-content">{rysuj()}</div>}
      </div>
    )
  },
  /* `rysuj` i `api` z porównania wypadają: pierwsze jest nowe przy każdym
     przerysowaniu, a o zmianie treści mówi `sygnatura`; drugie jest stałe.
     Samego węzła też nie porównujemy przez tożsamość — od kiedy tekst
     mieszka w ścieżce, każde naciśnięcie klawisza tworzy nowe obiekty
     wszystkich węzłów, a to znaczyłoby przerysowanie całej listy. Za to
     `sygnatura` zawiera cały węzeł, więc żadna zmiana się nie prześlizgnie. */
  (a, b) =>
    a.n.id === b.n.id &&
    a.n.kind === b.n.kind &&
    a.i === b.i &&
    a.pelny === b.pelny &&
    a.zaznaczony === b.zaznaczony &&
    a.kreska === b.kreska &&
    a.wysokosc === b.wysokosc &&
    a.mozeScalic === b.mozeScalic &&
    a.sygnatura === b.sygnatura,
)

/** Kafelek w trybie przypominania: widać, że tu coś stoi i czego dotyczy,
 *  ale nie widać treści. Klikasz dopiero wtedy, gdy sam sobie odpowiesz. */
function ZakrytyKafelek({
  opis,
  onOdslon,
}: {
  opis: { znak: string; nazwa: string; barwa?: string }
  onOdslon: () => void
}) {
  return (
    <button className="kafelek-zakryty" onClick={onOdslon} title="Kliknij, aby sprawdzić">
      <span className="kafelek-zakryty-glowa">
        {opis.znak && (
          <span className="kafelek-zakryty-znak" style={{ color: opis.barwa }}>
            {opis.znak}
          </span>
        )}
        <span className="kafelek-zakryty-nazwa">{opis.nazwa}</span>
      </span>
      <span className="kafelek-zakryty-hint">
        <Icon name="odkryj" size={0.95} />
        przypomnij sobie · kliknij, aby sprawdzić
      </span>
    </button>
  )
}

interface PoleProps {
  wartosc: string
  zapisz: (md: string) => void
  /** Oddaje edytor do wspólnego paska narzędzi (null przy znikaniu). */
  zarejestruj: (ed: Editor | null) => void
  naKursor: () => void
}

/** Pole tekstowe kafelka. Sam decyduje, kiedy stać się polem — dzięki temu
 *  lista segmentów nie przerysowuje się przy każdym dostawianym polu (przy
 *  ścieżce na dwa tysiące kafelków to była większość kosztu).
 *
 *  Kolejność jest taka: kafelek wjeżdża na ekran i pokazuje gotowy tekst,
 *  a ułamek sekundy później zamienia się w pole. Kliknięcie nie czeka na nic —
 *  robi z niego pole natychmiast, z kursorem dokładnie pod myszą. */
const PoleTresci = memo(function PoleTresci({
  wartosc,
  zapisz,
  zarejestruj,
  naKursor,
}: PoleProps) {
  const [gotowe, setGotowe] = useState(false)
  const punktRef = useRef<{ x: number; y: number } | null>(null)
  const tekstRef = useRef<HTMLDivElement | null>(null)
  const edytorRef = useRef<Editor | null>(null)
  /** Czy ktoś w ogóle postawił tu kursor. Dopóki nie — nic nie zapisujemy. */
  const dotknieteRef = useRef(false)
  /** Podbijane, gdy tekst zmienił się Z ZEWNĄTRZ.
   *
   *  Pole trzyma własną kopię treści i nie podgląda propsów — po komponowaniu
   *  albo po poprawce w kafelku pokazywałoby więc starą wersję, a najbliższy
   *  zapis by ją utrwalił. Własnego pisania nie ruszamy: tam skakałby kursor. */
  const [odswiezenie, setOdswiezenie] = useState(0)
  const ostatniaRef = useRef(wartosc)
  useEffect(() => {
    if (wartosc === ostatniaRef.current) return
    ostatniaRef.current = wartosc
    if (dotknieteRef.current) return
    setOdswiezenie((n) => n + 1)
  }, [wartosc])

  useEffect(() => {
    const zapal = () => {
      const el = tekstRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        // za daleko od ekranu — niech poczeka, aż tam dojedziemy
        if (r.bottom < -ZASIEG_POLA || r.top > window.innerHeight + ZASIEG_POLA) {
          return false
        }
      }
      setGotowe(true)
      return true
    }
    doKolejki(zapal)
    return () => zKolejki(zapal)
  }, [])

  if (!gotowe) {
    return (
      <div
        ref={tekstRef}
        className="markdown-body do-pisania"
        onPointerDown={(e) => {
          if ((e.target as Element).closest('a, button, select')) return
          if (e.ctrlKey || e.metaKey || e.shiftKey) return
          punktRef.current = { x: e.clientX, y: e.clientY }
          setGotowe(true)
        }}
        dangerouslySetInnerHTML={{
          __html: wartosc ? renderMarkdown(wartosc) : '<p class="note-empty">pusto</p>',
        }}
      />
    )
  }
  return (
    <div className="linear-pole">
      <RichEditor
        key={odswiezenie}
        value={wartosc}
        editable
        bezPaska
        ruler={false}
        /* Zapisujemy TYLKO wtedy, gdy pisze człowiek.
         *
         *  Samo postawienie pola wywołuje zmianę treści — Markdown wczytany
         *  do edytora i zapisany z powrotem nie zawsze wraca znak w znak
         *  (np. zagnieżdżone listy). Bez tej bramki każdy kafelek, na który
         *  ktoś tylko spojrzał, robił sobie własną kopię tekstu i po cichu
         *  odcinał się od kafelka w bibliotece. */
        onChange={(md) => {
          if (!dotknieteRef.current) return
          zapisz(md)
        }}
        onFocus={() => {
          dotknieteRef.current = true
          naKursor()
        }}
        onReady={(ed) => {
          edytorRef.current = ed
          zarejestruj(ed)
          const p = punktRef.current
          punktRef.current = null
          if (!ed || !p) return
          // kursor tam, gdzie padło kliknięcie — inaczej skakałby na początek
          requestAnimationFrame(() => {
            const trafiony = ed.view.posAtCoords({ left: p.x, top: p.y })
            ed.chain().focus().setTextSelection(trafiony?.pos ?? 0).run()
            naKursor()
          })
        }}
      />
    </div>
  )
})

function LinearView({
  ordered,
  onDropConcept,
  onMoveSegment,
  onMoveSegments,
  onAddNote,
  onAddExample,
  onKeepHere,
  onRemove,
  onEdit,
  onUnfuse,
  onToggleSide,
  onSetSubpage,
  onSetVersion,
  onAddHeading,
  onGroupWithNext,
  onFuseSelected,
  celKlocek,
  pathId,
  zakryte,
  onJumpToSource,
  onOpenConcept,
  onRenameSegment,
  onEditBlock,
  onWrocDoKlocka,
  onWyslijDoBiblioteki,
  onEditNote,
  onEditHeading,
  onPoziomRozdzialu,
  onRozmiarRozdzialu,
  onRenameFusion,
  onEditFusion,
}: LinearViewProps) {
  /** Pole, w którym stoi kursor — na nim działa wspólny pasek narzędzi. */
  const [aktywny, setAktywny] = useState<Editor | null>(null)
  /** Rodzaje kafelków — do plakietek w spisie treści. */
  const typy = useBlockTypes()
  /** Rodzaje mieszkające w ścieżce (przykład, zadanie…) — z nich robią się
   *  przyciski „nowy tutejszy" w menu szczeliny i na dole Linii. */
  const tutejszeRodzaje = typy.choices.filter((t) => t.wSciezce)
  /** Kafelek, przy którym się pracuje — ostatnio kliknięty. Pokazuje go prawy
   *  panel i spis treści. */
  const [biezacy, setBiezacy] = useState<string | null>(null)
  /** Kafelki odsłonięte ręcznie w trybie zakrytym. */
  const [odsloniete, setOdsloniete] = useState<Set<string>>(new Set())
  useEffect(() => {
    // wyjście z trybu i ponowne wejście zaczyna przypominanie od nowa
    if (!zakryte) setOdsloniete(new Set())
  }, [zakryte])
  /** Okno: rysujemy tylko kafelki blisko ekranu, reszta to same puste miejsca.
   *
   *  Bez tego każde przerysowanie Linii tworzyło tyle elementów, ile ścieżka ma
   *  kafelków — przy pięciuset to ćwierć sekundy na jedno naciśnięcie klawisza,
   *  przy dwóch tysiącach byłoby cztery razy tyle. Z oknem koszt przerysowania
   *  przestaje zależeć od długości ścieżki: liczy się tylko to, co widać.
   *
   *  Puste miejsce zachowuje ostatnią zmierzoną wysokość kafelka, więc pasek
   *  przewijania i spis treści zostają tam, gdzie były. */
  const ZAPAS = 3
  const [okno, setOkno] = useState({ od: 0, do: 24 })
  const oknoRef = useRef(okno)
  const naEkranie = useRef(new Set<number>())
  const wysokosci = useRef(new Map<string, number>())
  /** Ile średnio ma kafelek w TEJ ścieżce — lepsza zgadywanka wysokości
   *  pustego miejsca niż jedna liczba na sztywno. Zła zgadywanka to właśnie
   *  te przeskoki przy skakaniu po spisie treści: pasek przewijania pokazuje
   *  co innego, niż wyjdzie po narysowaniu. */
  const sredniaRef = useRef(150)
  const zmierz = (id: string) => wysokosci.current.get(id) ?? sredniaRef.current
  const planRef = useRef(0)
  const przeliczRef = useRef<() => void>(() => {})

  const przelicz = useCallback(() => {
    if (naEkranie.current.size === 0) return
    let min = Infinity
    let max = -Infinity
    for (const i of naEkranie.current) {
      if (i < min) min = i
      if (i > max) max = i
    }
    const od = Math.max(0, min - ZAPAS)
    const doo = max + ZAPAS
    if (od === oknoRef.current.od && doo === oknoRef.current.do) return
    oknoRef.current = { od, do: doo }
    setOkno(oknoRef.current)
  }, [])
  przeliczRef.current = przelicz

  const [obserwator] = useState(() =>
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (wpisy) => {
            // widok drgnął — wstrzymuje stawianie pól, żeby przewijanie
            // miało pierwszeństwo przed budowaniem edytorów
            ruchWidoku()
            for (const w of wpisy) {
              const el = w.target as HTMLElement
              const i = Number(el.dataset.idx)
              if (Number.isNaN(i)) continue
              if (w.isIntersecting) naEkranie.current.add(i)
              else naEkranie.current.delete(i)
              // wysokość mierzymy tylko na narysowanym kafelku — pustego
              // miejsca nie ma po co mierzyć, bo to nasza własna liczba
              const h = w.boundingClientRect.height
              if (h > 4 && el.dataset.pelny === '1' && el.dataset.seg) {
                wysokosci.current.set(el.dataset.seg, h)
                // średnia biegnie po zmierzonych — im więcej kafelków
                // widzieliśmy, tym trafniej zgadujemy resztę
                let suma = 0
                for (const v of wysokosci.current.values()) suma += v
                sredniaRef.current = suma / wysokosci.current.size
              }
            }
            cancelAnimationFrame(planRef.current)
            planRef.current = requestAnimationFrame(() => przeliczRef.current())
          },
          /* Zapas w pikselach: kafelki wchodzą do okna, zanim je widać.
             Za mały zapas znaczy puste miejsca w trakcie szybkiego
             przewijania; za duży — więcej pól tekstowych do postawienia. */
          { rootMargin: '600px 0px' },
        ),
  )
  useEffect(
    () => () => {
      obserwator?.disconnect()
      cancelAnimationFrame(planRef.current)
    },
    [obserwator],
  )
  /** Ścieżka pamięta, gdzie się skończyło czytanie.
   *
   *  Wracasz do niej po dniu i jesteś tam, gdzie byłeś — a nie na początku,
   *  z setką kafelków do przewinięcia. Zapisujemy w pamięci przeglądarki, bo
   *  to sprawa tego komputera, a nie treści ścieżki. */
  const kluczMiejsca = `ui.miejsceWSciezce.${pathId}`
  const widokRef = useRef<HTMLDivElement | null>(null)
  const przywroconoRef = useRef(false)
  useEffect(() => {
    const el = widokRef.current
    if (!el || przywroconoRef.current || celKlocek) return
    const zapisane = Number(localStorage.getItem(kluczMiejsca) ?? '0')
    if (!zapisane) {
      przywroconoRef.current = true
      return
    }
    // Kafelki poza oknem mają dopiero zgadywaną wysokość, więc pierwszy skok
    // bywa niecelny — poprawiamy go jeszcze przez chwilę, aż treść się ułoży.
    //
    // Ale tylko dopóki nikt inny nie przewija: klik w spisie treści też
    // dociąga swój cel przez ponad sekundę, a dwa przewijania naraz szarpały
    // widokiem w górę i w dół, aż jedno się skończyło. Kto przewija celowo
    // (spis albo sam użytkownik), ten wygrywa — my odpuszczamy.
    let n = 0
    let t = 0
    /** Samo posprzątanie — bez ogłaszania, że odtwarzanie się udało.
     *  Efekt uruchamia się ponownie, gdy doczytają się kafelki, i wtedy
     *  odtwarzanie ma zacząć się od nowa, a nie zostać uznane za zrobione. */
    const sprzataj = () => {
      window.clearTimeout(t)
      el.removeEventListener('wheel', poddaj)
      el.removeEventListener('touchstart', poddaj)
    }
    /** Koniec na dobre: albo dojechaliśmy, albo ktoś przewija po swojemu. */
    function poddaj() {
      sprzataj()
      przywroconoRef.current = true
    }
    el.addEventListener('wheel', poddaj, { passive: true })
    el.addEventListener('touchstart', poddaj, { passive: true })
    const skocz = () => {
      if (el.dataset.skok === '1') return poddaj()
      el.scrollTop = zapisane
      if (++n < 12) t = window.setTimeout(skocz, 90)
      else poddaj()
    }
    skocz()
    return sprzataj
  }, [kluczMiejsca, celKlocek, ordered.length])
  useEffect(() => {
    const el = widokRef.current
    if (!el) return
    let t = 0
    const zapamietaj = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        if (przywroconoRef.current) localStorage.setItem(kluczMiejsca, String(el.scrollTop))
      }, 300)
    }
    el.addEventListener('scroll', zapamietaj, { passive: true })
    return () => {
      el.removeEventListener('scroll', zapamietaj)
      window.clearTimeout(t)
    }
  }, [kluczMiejsca])

  /** Skok do wskazanego kafelka: rysujemy go (choćby był daleko poza oknem),
   *  przewijamy na środek i na moment podświetlamy, żeby dało się go znaleźć
   *  wzrokiem w długim skrypcie. */
  const [podswietlony, setPodswietlony] = useState<string | null>(null)
  useEffect(() => {
    if (!celKlocek) return
    const i = ordered.findIndex(
      (n) =>
        (n.kind === 'block' && n.conceptId === celKlocek) ||
        (n.kind === 'fusion' && n.parts.some((p) => p.conceptId === celKlocek)),
    )
    if (i < 0) return
    const seg = ordered[i]
    oknoRef.current = { od: Math.max(0, i - ZAPAS), do: i + ZAPAS }
    setOkno(oknoRef.current)
    setPodswietlony(seg.id)
    const t = window.setTimeout(() => {
      document
        .querySelector(`[data-seg="${seg.id}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
    const gasnie = window.setTimeout(() => setPodswietlony(null), 2600)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(gasnie)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celKlocek, ordered.length])

  /** React 19 sprząta po ref-callbacku sam, jeśli oddamy mu funkcję. */
  const pilnuj = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !obserwator) return
      obserwator.observe(el)
      return () => obserwator.unobserve(el)
    },
    [obserwator],
  )

  /** Który segment ma kursor + wszystkie żywe pola, żeby pasek mógł się
   *  na właściwy przełączyć.
   *
   *  Pasek jest czynny od razu, bez klikania w tekst: dopóki nigdzie nie
   *  postawiono kursora, działa na pierwszym polu w widoku. Wyjście z pola
   *  niczego nie gasi — inaczej przyciski migałyby przy każdym kliknięciu obok.
   *
   *  Zgłoszenie się pola NIE przerysowuje listy. To ważne przy długiej ścieżce:
   *  pola dostawiają się jedno po drugim, a gdyby każde z nich odświeżało całą
   *  listę, przy dwóch tysiącach kafelków koszt wróciłby drzwiami. */
  const [aktywnyId, setAktywnyId] = useState<string | null>(null)
  const edytoryRef = useRef(new Map<string, Editor>())
  const zarejestrujPole = useCallback((segId: string, ed: Editor | null) => {
    if (ed) {
      edytoryRef.current.set(segId, ed)
      // pierwsze pole w widoku przejmuje pasek, dopóki nikt nie postawi kursora
      setAktywnyId((prev) => prev ?? segId)
    } else {
      edytoryRef.current.delete(segId)
      setAktywnyId((prev) => (prev === segId ? null : prev))
    }
  }, [])
  useEffect(() => {
    setAktywny(
      (aktywnyId ? edytoryRef.current.get(aktywnyId) : null) ??
        edytoryRef.current.values().next().value ??
        null,
    )
  }, [aktywnyId])
  /** Gdzie wyląduje przeciągany kafelek — numer SZCZELINY między kafelkami,
   *  od 0 (przed pierwszym) do `ordered.length` (za ostatnim).
   *
   *  Wcześniej trzymaliśmy to jako „pod kafelkiem X" albo „nad kafelkiem Y".
   *  Jedna i ta sama szczelina miała więc dwa opisy, a każdy z nich rysował
   *  kreskę o kilka pikseli gdzie indziej — przy najlżejszym ruchu myszy
   *  kreska drgała i wyglądało to na dwa miejsca zamiast jednego. */
  const [szczelina, setSzczelina] = useState<number | null>(null)
  const [endHint, setEndHint] = useState(false)
  /** Zaznaczone segmenty (Ctrl dokłada, Shift bierze zakres). Przeciągnięcie
   *  uchwytu któregokolwiek z nich przenosi całą grupę. */
  const [zazSeg, setZazSeg] = useState<Set<string>>(new Set())
  const kotwicaRef = useRef<string | null>(null)

  /** Zwraca true, jeśli klik był zaznaczaniem — wtedy nic innego się nie dzieje. */
  const klikSegmentu = (e: React.MouseEvent, id: string): boolean => {
    if (e.ctrlKey || e.metaKey) {
      setZazSeg((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      kotwicaRef.current = id
      return true
    }
    if (e.shiftKey && kotwicaRef.current) {
      const lista = ordered.map((n) => n.id)
      const a = lista.indexOf(kotwicaRef.current)
      const b = lista.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [od, doo] = a <= b ? [a, b] : [b, a]
        setZazSeg(new Set(lista.slice(od, doo + 1)))
        return true
      }
    }
    if (zazSeg.size > 0) setZazSeg(new Set())
    kotwicaRef.current = id
    return false
  }

  /** Menu wstawiania spod prawego przycisku — wraz z miejscem w łańcuchu. */
  /** Która pozycja menu segmentu jest rozwinięta klikiem. */
  const [rozwinieteWersje, setRozwinieteWersje] = useState<string | null>(null)
  const [segMenu, setSegMenu] = useState<{
    x: number
    y: number
    index: number
    pos: 'before' | 'after'
  } | null>(null)

  useEffect(() => {
    if (!segMenu) setRozwinieteWersje(null)
    if (!segMenu) return
    // przechwytywanie, nie bąbelkowanie — patrz Sidebar: pole tekstowe
    // zatrzymywało kliknięcie i menu zostawało otwarte
    const zamknij = (e: Event) => {
      const cel = e.target
      if (cel instanceof Element && cel.closest('.tree-menu')) return
      // suwak wielkości zmienia wysokość treści, a to bywa przewinięciem
      if (e.type === 'scroll' && document.activeElement?.closest('.tree-menu')) return
      setSegMenu(null)
    }
    const klawisz = (e: KeyboardEvent) => e.key === 'Escape' && setSegMenu(null)
    document.addEventListener('mousedown', zamknij, true)
    document.addEventListener('scroll', zamknij, true)
    window.addEventListener('keydown', klawisz)
    return () => {
      document.removeEventListener('mousedown', zamknij, true)
      document.removeEventListener('scroll', zamknij, true)
      window.removeEventListener('keydown', klawisz)
    }
  }, [segMenu])
  // Tylko kafelki użyte w tej ścieżce. Czytanie całych tabel oznaczało, że
  // przy dużej bazie każdy zapis kopiował treść wszystkich kafelków świata,
  // żeby narysować kilkadziesiąt z nich.
  const uzyte = useMemo(() => {
    const s = new Set<string>()
    for (const n of ordered) {
      if (n.kind === 'block') s.add(n.conceptId)
      else if (n.kind === 'fusion') for (const p of n.parts) s.add(p.conceptId)
    }
    return [...s].sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered.map((n) => n.id).join(',')])
  const klucz = uzyte.join(',')
  /** Jedno zapytanie, które NIESIE ZE SOBĄ swój klucz.
   *
   *  Bez tego nie da się odróżnić „dane jeszcze nie doszły" od „kafelka
   *  naprawdę nie ma": po dołożeniu kafelka żywe zapytanie oddaje przez
   *  chwilę poprzedni wynik, a on wygląda zupełnie normalnie — tyle że nie
   *  ma w nim nowego kafelka. Kafelek mrugał wtedy napisem „(usunięte
   *  pojęcie)". Skoro wynik mówi, dla jakiego zestawu powstał, wiadomo. */
  const wynik = useLiveQuery(async () => {
    const [concepts, versions, subpages] = await Promise.all([
      db.concepts.where('id').anyOf(uzyte).toArray(),
      db.versions.where('conceptId').anyOf(uzyte).toArray(),
      db.subpages.where('conceptId').anyOf(uzyte).toArray(),
    ])
    return { klucz, concepts, versions, subpages }
  }, [klucz])

  const mrozoneRef = useRef({
    concepts: [] as Concept[],
    versions: [] as BlockVersion[],
    subpages: [] as Subpage[],
    /** Dla jakiego zestawu kafelków te dane są — patrz `daneAktualne`. */
    klucz: '',
  })
  /** Nowe dane bierzemy tylko wtedy, gdy naprawdę są i są dla tego zestawu. */
  if (wynik && wynik.klucz === klucz) mrozoneRef.current = wynik
  const { concepts, versions, subpages } = mrozoneRef.current
  /** Czy trzymane dane opisują dokładnie ten zestaw kafelków, który mamy
   *  narysować. Po dołożeniu kafelka przez chwilę nie — i wtedy brak kafelka
   *  w mapie znaczy „jeszcze nie doszedł", a nie „skasowany". */
  const daneAktualne = mrozoneRef.current.klucz === klucz


  // Podręczne mapy zamiast przeszukiwania tablic przy każdym kafelku.
  // Przy 500 segmentach `find` w pętli to ćwierć miliona przebiegów na jedno
  // przerysowanie — i stąd braly się zacięcia po ~900 ms przy pisaniu.
  const mapy = useMemo(() => {
    const klocki = new Map(concepts.map((c) => [c.id, c]))
    const wersjeKlocka = new Map<string, typeof versions>()
    for (const v of versions) {
      const lista = wersjeKlocka.get(v.conceptId)
      if (lista) lista.push(v)
      else wersjeKlocka.set(v.conceptId, [v])
    }
    // strony grupujemy po WERSJI — każda wersja ma własne
    const stronyKlocka = new Map<string, typeof subpages>()
    const strony = new Map(subpages.map((s) => [s.id, s]))
    for (const s of [...subpages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const lista = stronyKlocka.get(s.versionId)
      if (lista) lista.push(s)
      else stronyKlocka.set(s.versionId, [s])
    }
    return { klocki, wersjeKlocka, stronyKlocka, strony }
  }, [concepts, versions, subpages])

  const conceptById = (id: string) => mapy.klocki.get(id)

  const isOurs = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(MIME) || e.dataTransfer.types.includes(SEG_MIME)

  /** Sąsiedzi dla wstawienia względem segmentu o indeksie i. */
  const neighbors = (i: number, pos: 'before' | 'after') => ({
    afterId: pos === 'before' ? (ordered[i - 1]?.id ?? null) : ordered[i].id,
    beforeId: pos === 'before' ? ordered[i].id : (ordered[i + 1]?.id ?? null),
  })

  const handleDrop = (e: React.DragEvent, afterId: string | null, beforeId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setSzczelina(null)
    setEndHint(false)
    const seg = e.dataTransfer.getData(SEG_MIME)
    if (seg) {
      // lista = przeciągnięto zaznaczenie wielu segmentów
      if (seg.startsWith('[')) onMoveSegments(JSON.parse(seg) as string[], afterId, beforeId)
      else onMoveSegment(seg, afterId, beforeId)
      setZazSeg(new Set())
      return
    }
    try {
      const raw = e.dataTransfer.getData(MIME)
      const p = raw ? (JSON.parse(raw) as { kind: string; id: string }) : null
      if (p?.kind === 'concept') onDropConcept(p.id, afterId, beforeId)
    } catch {
      /* zignoruj obcy drop */
    }
  }

  /** Bieżący stan podany ramkom segmentów bez zmiany tożsamości funkcji.
   *  Gdyby wywołania były zwykłymi domknięciami, każda ramka dostawałaby nowe
   *  propsy przy każdym przerysowaniu i cała oszczędność by przepadła. */
  const biezaceRef = useRef({
    ordered,
    zazSeg,
    szczelina,
    onGroupWithNext,
    onUnfuse,
    onRemove,
    klikSegmentu,
    handleDrop,
  })
  biezaceRef.current = {
    ordered,
    zazSeg,
    szczelina,
    onGroupWithNext,
    onUnfuse,
    onRemove,
    klikSegmentu,
    handleDrop,
  }

  const apiSegmentu = useMemo<ApiSegmentu>(
    () => ({
      klik: (e, id) => {
        // zaznaczamy tylko z klawiszem — zwykły klik ma nadal trafiać
        // w treść (odnośniki, przełączanie stron)
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          e.preventDefault()
          biezaceRef.current.klikSegmentu(e, id)
        }
      },
      nadCiagniete: (e, i) => {
        if (!isOurs(e)) return
        e.preventDefault()
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        setSzczelina(e.clientY - r.top < r.height / 2 ? i : i + 1)
        setEndHint(false)
      },
      upuszczone: (e, i) => {
        const { szczelina: s, ordered: lista, handleDrop: upusc } = biezaceRef.current
        const gdzie = s ?? i + 1
        upusc(e, lista[gdzie - 1]?.id ?? null, lista[gdzie]?.id ?? null)
      },
      menu: (e, i) => {
        // wstawianie tam, gdzie stoi kursor: górna połowa segmentu znaczy
        // „przed nim", dolna „za nim". Bez tego rozdział na początku skryptu
        // trzeba było dodać na końcu i przeciągać.
        if ((e.target as Element).closest('.linear-menu')) return
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        const pos = e.clientY - r.top < r.height / 2 ? 'before' : 'after'
        setSegMenu({ x: e.clientX, y: e.clientY, index: i, pos })
      },
      chwyt: (e, id) => {
        const { zazSeg: zaz, ordered: lista } = biezaceRef.current
        const grupa =
          zaz.has(id) && zaz.size > 1
            ? lista.filter((x) => zaz.has(x.id)).map((x) => x.id)
            : null
        e.dataTransfer.setData(SEG_MIME, grupa ? JSON.stringify(grupa) : id)
        e.dataTransfer.effectAllowed = 'move'
      },
      scal: (id) => biezaceRef.current.onGroupWithNext(id),
      rozdziel: (id) => biezaceRef.current.onUnfuse(id),
      usun: (id) => biezaceRef.current.onRemove(id),
    }),
    [],
  )

  /** Pole tekstowe segmentu — jest od razu, bez klikania i bez żadnego
   *  „trybu edycji". Cała ścieżka JEST edytorem.
   *
   *  Stać nas na to dlatego, że rysujemy tylko kilkanaście kafelków wokół
   *  ekranu (patrz `okno`). Postawienie pola kosztuje — parsowanie Markdownu
   *  i rysowanie wzorów — więc gdyby dotyczyło całej ścieżki, przy pięciuset
   *  kafelkach nie dałoby się otworzyć Linii. Kilkanaście pól to nic. */
  const poleTresci = (
    segId: string,
    kluczTresci: string,
    value: string,
    zapisz: (md: string) => void,
  ) => (
    <PoleTresci
      key={kluczTresci}
      wartosc={value}
      zapisz={zapisz}
      naKursor={() => setAktywnyId(segId)}
      zarejestruj={(ed) => zarejestrujPole(segId, ed)}
    />
  )

  /** Wszystko, od czego zależy wygląd segmentu, w jednym napisie. */
  const sygnatura = (n: PathNode): string => {
    if (n.kind === 'fusion') {
      // treść składników siedzi w kafelkach, nie w węźle ścieżki — bez niej
      // scalony blok nie odświeżałby się po zmianie któregoś z kafelków
      const czesci = n.parts
        .map((p) => {
          const c = mapy.klocki.get(p.conceptId)
          const wers = mapy.wersjeKlocka.get(p.conceptId) ?? []
          const w =
            wers.find((v) => v.id === p.versionId) ??
            wers.find((v) => v.id === c?.currentVersionId)
          const s = p.subpageId ? mapy.strony.get(p.subpageId) : undefined
          return [c?.name, c?.currentVersionId, w?.id, w?.content, s?.id, s?.content].join('|')
        })
        .join('#')
      return `fusion|${JSON.stringify(n)}|${czesci}`
    }
    if (n.kind !== 'block') {
      return `${n.kind}|${JSON.stringify(n)}`
    }
    const c = mapy.klocki.get(n.conceptId)
    const wersje = mapy.wersjeKlocka.get(n.conceptId) ?? []
    const w =
      wersje.find((v) => v.id === n.versionId) ??
      wersje.find((v) => v.id === c?.currentVersionId)
    const s = n.subpageId ? mapy.strony.get(n.subpageId) : undefined
    const strony = (w ? (mapy.stronyKlocka.get(w.id) ?? []) : [])
      .map((x) => `${x.id}:${x.name}`)
      .join(',')
    return [
      // cały węzeł: siedzi w nim własny tekst i własna nazwa kafelka
      JSON.stringify(n),
      c?.name,
      c?.type,
      c?.pathId,
      c?.mainPageName,
      c?.currentVersionId,
      w?.id,
      w?.content,
      w?.label,
      w?.sourceRefs?.length ?? 0,
      w?.updatedAt,
      wersje.length,
      s?.id,
      s?.content,
      strony,
    ].join('|')
  }

  const segmentContent = (n: PathNode) => {
    if (n.kind === 'block') {
      const c = conceptById(n.conceptId)
      // pusta ramka, dopóki kafelek nie doszedł z bazy — napis o usunięciu
      // należy się tylko temu, którego naprawdę nie ma
      if (!c) {
        return daneAktualne ? (
          <div className="script-block">(usunięte pojęcie)</div>
        ) : (
          <div className="script-block script-block-czeka" />
        )
      }
      const wersje = mapy.wersjeKlocka.get(c.id) ?? []
      const wersja =
        wersje.find((v) => v.id === n.versionId) ??
        wersje.find((v) => v.id === c.currentVersionId)
      const strona = (n.subpageId ? mapy.strony.get(n.subpageId) : null) ?? null
      // Wszystko w ścieżce jest do pisania — także starsza wersja kafelka.
      // Wersje to u nas różne ujęcia tej samej rzeczy („wg Rudina"), a nie
      // zamknięta historia, więc nie ma czego bronić przed poprawianiem.
      const wolno = !!onEditBlock && !!wersja
      // Tekst napisany w ścieżce ma pierwszeństwo. Brak takiego = pokazujemy
      // kafelek żywcem, razem z każdą późniejszą poprawką z biblioteki.
      const klucz = wersja ? kluczWlasnej(wersja.id, strona?.id) : ''
      const wlasna = wersja ? n.wlasneTresci?.[klucz] : undefined
      const tresc = wlasna ?? (strona ? strona.content : (wersja?.content ?? ''))
      return (
        <BlockShell
          concept={c}
          versions={wersje}
          versionId={n.versionId}
          onVersionChange={(id: string | null) => onSetVersion(n.id, id)}
          subpageId={n.subpageId ?? null}
          onSubpageChange={(id: string | null) => onSetSubpage(n.id, id)}
          onOpenConcept={onOpenConcept}
          onJumpToSource={onJumpToSource}
          showOpen={false}
          subsZewn={wersja ? (mapy.stronyKlocka.get(wersja.id) ?? []) : []}
          pickHint="Ustawienie tej ścieżki — tak będzie pokazywane przy czytaniu"
          nazwaWlasna={n.nazwa}
          trescWlasna={wlasna}
          bezPaskaWersji
          pochodzenie
          dzialanie={
            wersja && wlasna !== undefined && !c.pathId && onWyslijDoBiblioteki ? (
              <button
                className="btn btn-wyslij"
                title="Ten tekst stanie się nową wersją kafelka. Dotychczasowa wersja zostaje."
                onClick={(e) => {
                  e.stopPropagation()
                  onWyslijDoBiblioteki(n.id, c.id, wersja.id, strona?.id ?? null, wlasna)
                }}
              >
                Wyślij do biblioteki
              </button>
            ) : undefined
          }
          onRename={onRenameSegment ? (name) => onRenameSegment(n.id, name) : undefined}
          // jedyny przypadek, w którym nie ma gdzie pisać: kafelek bez żadnej
          // wersji. Niech to widać, zamiast cicho pokazywać sam tekst.
          blokada={
            wersja ? undefined : 'Ten kafelek nie ma jeszcze żadnej wersji — otwórz go i dodaj treść'
          }
          edytor={
            wolno && wersja
              ? poleTresci(
                  n.id,
                  `${n.id}:${klucz}`,
                  tresc,
                  (md) => onEditBlock!(n.id, wersja.id, strona?.id ?? null, md),
                )
              : undefined
          }
        />
      )
    }
    if (n.kind === 'heading') {
      const H = (`h${n.level + 1}` as unknown) as 'h2'
      return (
        <H
          id={outlineId(n.id)}
          className={`script-heading-node level-${n.level}`}
          style={stylRozdzialu(n.rozmiar)}
        >
          {onEditHeading ? (
            <input
              className="inline-title"
              value={n.text}
              placeholder="Nazwa rozdziału…"
              onChange={(e) => onEditHeading(n.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            n.text || '(rozdział bez nazwy)'
          )}
        </H>
      )
    }
    if (n.kind === 'text') {
      if (!onEditNote) {
        return (
          <div
            className="script-text markdown-body linear-note"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(n.text) }}
          />
        )
      }
      return (
        <div className="script-text linear-note">
          {poleTresci(n.id, n.id, n.text, (md) => onEditNote(n.id, md))}
        </div>
      )
    }
    if (n.kind === 'comment') {
      // notatka boczna: domyślnie po prawej, ⇄ przekłada na drugą stronę
      return (
        <aside
          className={`linear-sidenote side-${n.side ?? 'right'}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(SEG_MIME, n.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
        >
          <div className="sidenote-head">
            <span className="linear-comment-badge">💬 komentarz</span>
            <span className="sidenote-actions">
              <button
                className="folder-action"
                title="Przełóż na drugą stronę"
                onClick={() => onToggleSide(n.id)}
              >
                ⇄
              </button>
              <button
                className="folder-action"
                title="Usuń ze ścieżki"
                onClick={() => onRemove(n.id)}
              >
                ×
              </button>
            </span>
          </div>
          {onEditNote ? (
            poleTresci(n.id, n.id, n.text, (md) => onEditNote(n.id, md))
          ) : (
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(n.text) }}
            />
          )}
        </aside>
      )
    }
    // złożony kafelek: jeden własny tekst, materiały zostały w bibliotece
    return (
      <GroupShell
        name={n.name}
        type={n.type}
        parts={n.parts}
        content={n.content}
        strony={n.strony}
        zrodla={n.zrodla}
        onJumpToSource={onJumpToSource}
        onRename={onRenameFusion ? (name) => onRenameFusion(n.id, name) : undefined}
        zewn={{ concepts, versions, subpages }}
        pochodzenie
        edytor={
          onEditFusion
            ? (klucz, tresc, zapisz) =>
                poleTresci(`${n.id}:${klucz}`, `${n.id}:${klucz}`, tresc, zapisz)
            : undefined
        }
        onEditContent={
          onEditFusion ? (md, stronaId) => onEditFusion(n.id, md, stronaId) : undefined
        }
      />
    )
  }

  const last = ordered[ordered.length - 1] ?? null
  /** Czy ten segment w ogóle podlega zakrywaniu.
   *
   *  Rozdziały i komentarze zostają widoczne — bez nich nie wiadomo, przy
   *  czym się jest i czego właściwie sobie przypominać. */
  const doZakrycia = (n: PathNode) =>
    !!zakryte && (n.kind === 'block' || n.kind === 'fusion' || n.kind === 'text')
  const zakrywac = (n: PathNode) => doZakrycia(n) && !odsloniete.has(n.id)
  /** Odsłonięty kafelek chowa się z powrotem tym samym kliknięciem — można
   *  sprawdzić, schować i spróbować jeszcze raz. */
  const przelaczOdsloniecie = (id: string) =>
    setOdsloniete((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** Co widać na zakrytym kafelku: rodzaj i nazwa, czyli tyle, ile trzeba,
   *  żeby móc sobie przypomnieć resztę. */
  const opisZakrytego = (n: PathNode) => {
    if (n.kind === 'fusion') {
      return {
        znak: n.type ? typy.short(n.type) : '⧉',
        nazwa: n.name,
        barwa: n.type ? typy.def(n.type).color : undefined,
      }
    }
    if (n.kind === 'text') return { znak: '✎', nazwa: 'Notatka', barwa: undefined }
    if (n.kind !== 'block') return { znak: '', nazwa: '', barwa: undefined }
    const c = mapy.klocki.get(n.conceptId)
    return {
      znak: c ? typy.short(c.type) : '',
      nazwa: n.nazwa ?? c?.name ?? '(usunięty kafelek)',
      barwa: c ? typy.def(c.type).color : undefined,
    }
  }

  const zapamietajBiezacy = (e: React.SyntheticEvent) => {
    const id = (e.target as Element).closest<HTMLElement>('[data-seg]')?.dataset.seg
    const n = ordered.find((x) => x.id === id)
    if (n?.kind === 'block' || n?.kind === 'fusion') setBiezacy(n.id)
  }

  const outline = pozycjeSpisu(ordered, (id) => mapy.klocki.get(id), typy)
  const wezelBiezacy = ordered.find((n) => n.id === biezacy) ?? null

  return (
    <div
      className="linear-view"
      ref={widokRef}
      /* Kliknięcie obok kolumny gasi zaznaczenie — tak samo jak wszędzie
         indziej. Bez tego zaznaczenie zostawało do następnego Ctrl+kliku
         i nie było wiadomo, czego dotyczy „Scal zaznaczone". */
      onClick={(e) => {
        if ((e.target as Element).closest('.linear-seg, .linear-menu')) return
        if (zazSeg.size > 0) setZazSeg(new Set())
      }}
    >
      <Outline
        items={outline}
        onMove={onMoveSegment}
        biezacy={biezacy}
        onPoziom={onPoziomRozdzialu}
        onMenu={(e, nodeId) => {
          e.preventDefault()
          const index = ordered.findIndex((n) => n.id === nodeId)
          if (index >= 0) setSegMenu({ x: e.clientX, y: e.clientY, index, pos: 'after' })
        }}
      />
      {/* Pasek i kolumna razem w jednej kolumnie układu — inaczej pasek
          wchodziłby jako trzecia kolumna obok spisu treści i spychał tekst. */}
      <div className="linear-main">
        {/* Jeden pasek na całą ścieżkę — działa na tym polu, w którym stoi
            kursor. Ścieżka jest edytorem, a nie zbiorem okienek. */}
        {onEditNote &&
          (() => {
            const seg = aktywnyId?.split(':')[0]
            const pasek = (
              <div className="linear-toolbar">
                <RichToolbar editor={aktywny} zwarty={!!seg} />
              </div>
            )
            // pasek stoi w stopce kafelka, przy którym się pisze; notatki i
            // komentarze stopki nie mają, więc tam unosi się u dołu okna
            const cel = seg
              ? document.querySelector(`[data-seg="${seg}"] .block-narzedzia`)
              : null
            return cel ? createPortal(pasek, cel) : pasek
          })()}
      {/* Kreskę gasimy dopiero przy wyjściu z całej kolumny. Gdyby gasił ją
          każdy kafelek z osobna, migałaby przy przejeździe między nimi. */}
      <div
        className="linear-column"
        onClickCapture={zapamietajBiezacy}
        onFocusCapture={zapamietajBiezacy}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as HTMLElement | null)) return
          setSzczelina(null)
        }}
      >
        {ordered.map((n, i) => {
          /* Kreskę rysuje zawsze GÓRNA krawędź kafelka pod szczeliną — jedna
             szczelina, jedno miejsce. Ostatnia szczelina nie ma pod sobą
             kafelka, więc siada na dolnej krawędzi ostatniego. */
          const h =
            szczelina === i
              ? 'before'
              : szczelina === ordered.length && i === ordered.length - 1
                ? 'after'
                : null
          /** Rysujemy w całości to, co blisko ekranu — a poza tym zawsze
           *  rozdziały (spis treści musi mieć do czego skakać), komentarze
           *  boczne (są malutkie) i kafelek, w którym stoi kursor (inaczej
           *  zniknąłby spod piszącego, gdyby zjechał z ekranu). */
          const pelny =
            (i >= okno.od && i <= okno.do) ||
            n.kind === 'heading' ||
            n.kind === 'comment' ||
            // kursor może stać w składniku fuzji — stąd dwukropek
            aktywnyId === n.id ||
            aktywnyId?.startsWith(`${n.id}:`) === true ||
            podswietlony === n.id
          return (
            <RamkaSegmentu
              key={n.id}
              n={n}
              i={i}
              pelny={pelny}
              zaznaczony={zazSeg.has(n.id) || podswietlony === n.id}
              kreska={h}
              wysokosc={zmierz(n.id)}
              mozeScalic={
                ordered[i + 1]?.kind === 'block' || ordered[i + 1]?.kind === 'fusion'
              }
              sygnatura={
                pelny ? `${sygnatura(n)}|${zakrywac(n)}|${doZakrycia(n)}` : ''
              }
              rysuj={() =>
                zakrywac(n) ? (
                  <ZakrytyKafelek
                    opis={opisZakrytego(n)}
                    onOdslon={() => przelaczOdsloniecie(n.id)}
                  />
                ) : doZakrycia(n) ? (
                  // odsłonięty w trybie przypominania: treść tylko do
                  // czytania, a kliknięcie gdziekolwiek chowa ją z powrotem
                  <div
                    className="kafelek-odslony"
                    title="Kliknij, aby zakryć z powrotem"
                    onClick={() => przelaczOdsloniecie(n.id)}
                  >
                    <TrescSegmentu sygnatura={sygnatura(n)} rysuj={() => segmentContent(n)} />
                  </div>
                ) : (
                  <TrescSegmentu sygnatura={sygnatura(n)} rysuj={() => segmentContent(n)} />
                )
              }
              api={apiSegmentu}
              pilnuj={pilnuj}
            />
          )
        })}
        <div
          className={`linear-append ${endHint ? 'drop-into' : ''}`}
          onDragOver={(e) => {
            if (!isOurs(e)) return
            e.preventDefault()
            setEndHint(true)
            setSzczelina(null)
          }}
          onDragLeave={() => setEndHint(false)}
          onDrop={(e) => handleDrop(e, last?.id ?? null, null)}
        >
          <p>Przeciągnij kafelek z listy po lewej, aby dokleić go do skryptu…</p>
          {/* Jeden rząd, jedna zasada: znaczek (albo plakietka rodzaju)
              i podpis. Plusy przy części guzików mówiły to samo, co cały ten
              pasek — „tu się dokłada" — a rozpychały rząd tak, że przestawał
              się mieścić. */}
          <div className="linear-append-actions">
            <span className="linear-append-label">Dołóż:</span>
            {tutejszeRodzaje.map((t) => (
              <button
                key={t.id}
                className="btn btn-dolacz"
                title={`${t.label} należy do tej ścieżki — nie trafia do listy po lewej`}
                onClick={() => onAddExample(t.id, last?.id ?? null, null)}
              >
                <span className="type-mini menu-mini" data-typ={t.id} style={typy.style(t.id)}>
                  {t.short}
                </span>
                {t.label}
              </button>
            ))}
            <button
              className="btn btn-dolacz"
              title="Rozdział — dzieli skrypt na części"
              onClick={() => onAddHeading(1, last?.id ?? null, null)}
            >
              <Icon name="rozdzial" size={1} />
              Rozdział
            </button>
            <button
              className="btn btn-dolacz"
              title="Podrozdział"
              onClick={() => onAddHeading(2, last?.id ?? null, null)}
            >
              <Icon name="podrozdzial" size={1} />
              Podrozdział
            </button>
            <button
              className="btn btn-dolacz"
              title="Notatka — twój komentarz w ciągu skryptu"
              onClick={() => onAddNote('text', last?.id ?? null, null)}
            >
              <Icon name="notatka" size={1} />
              Notatka
            </button>
            <button
              className="btn btn-dolacz"
              title="Komentarz — obok skryptu, nie w nim"
              onClick={() => onAddNote('comment', last?.id ?? null, null)}
            >
              <Icon name="komentarz" size={1} />
              Komentarz
            </button>
          </div>
        </div>
      </div>
      </div>
      <KontekstKafelka
        wezel={wezelBiezacy}
        concepts={concepts}
        versions={versions}
        onJumpToSource={(r) => onJumpToSource?.(r)}
        onOpenConcept={(id) => onOpenConcept?.(id)}
      />

      {segMenu &&
        (() => {
          const { afterId, beforeId } = neighbors(segMenu.index, segMenu.pos)
          const sasiad = ordered[segMenu.index]
          const opis = (n: PathNode | undefined) =>
            !n
              ? ''
              : n.kind === 'heading'
                ? n.text || 'rozdział'
                : n.kind === 'block'
                  ? (conceptById(n.conceptId)?.name ?? 'kafelek')
                  : n.kind === 'fusion'
                    ? n.name
                    : n.kind === 'comment'
                      ? 'komentarzem'
                      : 'notatką'
          const wstaw = (fn: () => void) => () => {
            setSegMenu(null)
            fn()
          }
          /** Zaznaczone kafelki, które da się scalić — w kolejności z Linii. */
          const doScalenia = ordered
            .filter((n) => zazSeg.has(n.id) && (n.kind === 'block' || n.kind === 'fusion'))
            .map((n) => n.id)

          /** Wersje i przywracanie kafelka — wszystko, co dawniej stało
           *  napisami nad treścią. Kafelek ma pokazywać tekst, a nie
           *  metryczkę; to są rzeczy robione raz na jakiś czas. */
          const wybory: React.ReactNode[] = []
          const dodajWybor = (
            tytul: string,
            conceptId: string,
            wybranaId: string | null,
            ustaw: (id: string | null) => void,
            wlasny: (() => void) | null,
          ) => {
            const c = mapy.klocki.get(conceptId)
            const wersje = [...(mapy.wersjeKlocka.get(conceptId) ?? [])].sort(
              (a, b) => a.version - b.version,
            )
            const teraz =
              wersje.find((v) => v.id === wybranaId) ??
              wersje.find((v) => v.id === c?.currentVersionId)
            if (wersje.length < 2 && !wlasny) return
            const dopisek = wieluCzesci ? ` — ${tytul}` : ''
            if (wersje.length > 1) {
              // Wersje pod rozwijaną pozycją, nie płaską listą: menu ma
              // pokazywać czynności, a nie wysypywać wszystko naraz.
              wybory.push(
                <div
                  className={`tree-menu-podmenu ${
                    rozwinieteWersje === tytul ? 'otwarte' : ''
                  }`}
                  key={`${tytul}-w`}
                >
                  <button
                    className="tree-menu-item tree-menu-rozwija"
                    type="button"
                    aria-expanded={rozwinieteWersje === tytul}
                    onClick={() =>
                      setRozwinieteWersje((r) => (r === tytul ? null : tytul))
                    }
                  >
                    <span>
                      Wersja{dopisek}
                      <span className="tree-menu-teraz">
                        {teraz ? (teraz.label ?? `wersja ${teraz.version}`) : ''}
                      </span>
                    </span>
                    <span className="tree-menu-strzalka">›</span>
                  </button>
                  <div className="tree-menu tree-menu-boczne">
                    {wersje.map((v) => (
                      <button
                        key={v.id}
                        className={`tree-menu-item ${teraz?.id === v.id ? 'wybrany' : ''}`}
                        onClick={wstaw(() =>
                          ustaw(v.id === c?.currentVersionId ? null : v.id),
                        )}
                      >
                    {teraz?.id === v.id ? '• ' : '   '}
                        {v.label ?? `wersja ${v.version}`}
                      </button>
                    ))}
                  </div>
                </div>,
              )
            }
            if (wlasny) {
              wybory.push(
                <button
                  key={`${tytul}-wroc`}
                  className="tree-menu-item"
                  title="Porzuć tekst napisany tutaj i pokazuj z powrotem treść z biblioteki"
                  onClick={wstaw(wlasny)}
                >
                  <Icon name="przywroc" size={1} /> Przywróć treść z biblioteki{dopisek}
                </button>,
              )
            }
          }
          /** Scalony blok ma po składniku na każdy kafelek — wtedy przy każdej
           *  pozycji trzeba dopisać, o który z nich chodzi. */
          const wieluCzesci = sasiad?.kind === 'fusion' && sasiad.parts.length > 1
          if (sasiad?.kind === 'block') {
            const c = mapy.klocki.get(sasiad.conceptId)
            const wersje = mapy.wersjeKlocka.get(sasiad.conceptId) ?? []
            const w =
              wersje.find((v) => v.id === sasiad.versionId) ??
              wersje.find((v) => v.id === c?.currentVersionId)
            const strona = sasiad.subpageId ? mapy.strony.get(sasiad.subpageId) : undefined
            const maWlasny =
              !!w && sasiad.wlasneTresci?.[kluczWlasnej(w.id, strona?.id)] !== undefined
            dodajWybor(
              c?.name ?? 'Kafelek',
              sasiad.conceptId,
              sasiad.versionId,
              (id) => onSetVersion(sasiad.id, id),
              maWlasny && onWrocDoKlocka && w
                ? () => onWrocDoKlocka(sasiad.id, w.id, strona?.id ?? null)
                : null,
            )
          }
          return (
            <div
              className="tree-menu linear-menu"
              style={{ left: segMenu.x, top: segMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
              ref={(el) => {
                if (!el) return
                const r = el.getBoundingClientRect()
                const dx = Math.min(0, window.innerWidth - 6 - r.right)
                const dy = Math.min(0, window.innerHeight - 6 - r.bottom)
                if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`
              }}
            >
              {sasiad?.kind === 'heading' && onPoziomRozdzialu && onRozmiarRozdzialu && (
                <>
                  <div className="tree-menu-where">Poziom</div>
                  {(['Rozdział', 'Podrozdział', 'Sekcja'] as const).map((nazwa, k) => (
                    <button
                      key={nazwa}
                      className={`tree-menu-item ${sasiad.level === k + 1 ? 'wybrany' : ''}`}
                      onClick={() => onPoziomRozdzialu(sasiad.id, (k + 1) as 1 | 2 | 3)}
                    >
                      {sasiad.level === k + 1 ? '✓' : ''} {nazwa}
                    </button>
                  ))}
                  <div className="tree-menu-where">Wielkość tego rozdziału</div>
                  <label className="menu-wielkosc">
                    <input
                      type="range"
                      min={ROZDZIAL_MIN}
                      max={ROZDZIAL_MAX}
                      step={1}
                      value={sasiad.rozmiar ?? ROZDZIAL_ROZMIARY[sasiad.level]}
                      onChange={(e) => onRozmiarRozdzialu(sasiad.id, Number(e.target.value))}
                    />
                    <span>{sasiad.rozmiar ?? ROZDZIAL_ROZMIARY[sasiad.level]} px</span>
                  </label>
                  {sasiad.rozmiar !== undefined && (
                    <button
                      className="tree-menu-item"
                      onClick={() => onRozmiarRozdzialu(sasiad.id, undefined)}
                    >
                      Wróć do wielkości domyślnej
                    </button>
                  )}
                  <div className="tree-menu-sep" />
                </>
              )}
              {/* Scalanie z zaznaczenia. Kafelki nie muszą ze sobą sąsiadować:
                  definicja notacji zaznaczona razem z definicją, która jej
                  używa, wejdzie do jednego bloku, choćby leżały daleko od
                  siebie. Kolejność bierzemy z Linii, bo tak to widać. */}
              {doScalenia.length >= 2 && (
                <>
                  <button
                    className="tree-menu-item"
                    onClick={wstaw(() => {
                      onFuseSelected(doScalenia)
                      setZazSeg(new Set())
                    })}
                  >
                    <Icon name="scal" size={1} /> Scal zaznaczone ({doScalenia.length})
                  </button>
                  <div className="tree-menu-sep" />
                </>
              )}
              {/* Komponowanie: materiały zostają przy bloku na zawsze, więc
                  zawsze można tu wrócić i dobrać coś, o czym się zapomniało. */}
              {sasiad?.kind === 'fusion' && (
                <>
                  <div className="tree-menu-where">
                    Złożony kafelek „{sasiad.name || 'bez nazwy'}"
                  </div>
                  <button className="tree-menu-item" onClick={wstaw(() => onEdit(sasiad))}>
                    <Icon name="scal" size={1} /> Komponuj — nazwa, rodzaj, materiały
                  </button>
                  <button className="tree-menu-item" onClick={wstaw(() => onUnfuse(sasiad.id))}>
                    Rozdziel z powrotem
                  </button>
                  <div className="tree-menu-sep" />
                </>
              )}
              {sasiad?.kind === 'block' && (
                <>
                  {onOpenConcept && (
                    <button
                      className="tree-menu-item"
                      onClick={wstaw(() => onOpenConcept(sasiad.conceptId))}
                    >
                      <Icon name="otworz" size={1} /> Otwórz kafelek w edytorze
                    </button>
                  )}
                  {/* Rodzaje załatwiają zwykły przypadek (przykład, zadanie),
                      ale o pojedynczym kafelku musi dać się zdecydować ręcznie
                      — bez chodzenia do ustawień. */}
                  {(() => {
                    const tutejszy = mapy.klocki.get(sasiad.conceptId)?.pathId === pathId
                    return (
                      <button
                        className="tree-menu-item"
                        title={
                          tutejszy
                            ? 'Wróci do listy po lewej, zostając w tej ścieżce'
                            : 'Zniknie z listy po lewej i będzie mieszkać w tej ścieżce'
                        }
                        onClick={wstaw(() => onKeepHere(sasiad.conceptId, !tutejszy))}
                      >
                        <Icon name={tutejszy ? 'library' : 'tutaj'} size={1} />{' '}
                        {tutejszy ? 'Odeślij do biblioteki' : 'Trzymaj tylko tutaj'}
                      </button>
                    )
                  })()}
                  <div className="tree-menu-sep" />
                </>
              )}
              {wybory.length > 0 && (
                <>
                  {wybory}
                  <div className="tree-menu-sep" />
                </>
              )}
              {sasiad && (
                <>
                  <button
                    className="tree-menu-item tree-menu-groznie"
                    onClick={wstaw(() => onRemove(sasiad.id))}
                  >
                    <Icon name="usun" size={1} /> Usuń ze ścieżki
                  </button>
                  {sasiad.kind !== 'heading' && <div className="tree-menu-sep" />}
                </>
              )}
              {/* Menu rozdziału dotyczy samego rozdziału, a wstawianie tu tylko
                  myliło się z wyborem poziomu. */}
              {sasiad?.kind !== 'heading' && (
                <>
              <div className="tree-menu-where">
                Wstaw {segMenu.pos === 'before' ? 'przed' : 'po'} „{opis(sasiad)}"
              </div>
              {tutejszeRodzaje.map((t) => (
                <button
                  key={t.id}
                  className="tree-menu-item"
                  title={`${t.label} mieszka w tej ścieżce — nie ma go w liście po lewej`}
                  onClick={wstaw(() => onAddExample(t.id, afterId, beforeId))}
                >
                  <span className="type-mini menu-mini" data-typ={t.id} style={typy.style(t.id)}>
                    {t.short}
                  </span>{' '}
                  {t.label}
                </button>
              ))}
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddHeading(1, afterId, beforeId))}
              >
                <Icon name="rozdzial" size={1} /> Rozdział
              </button>
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddHeading(2, afterId, beforeId))}
              >
                <Icon name="podrozdzial" size={1} /> Podrozdział
              </button>
              <div className="tree-menu-sep" />
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddNote('text', afterId, beforeId))}
              >
                <Icon name="notatka" size={1} /> Notatka
              </button>
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddNote('comment', afterId, beforeId))}
              >
                <Icon name="komentarz" size={1} /> Komentarz
              </button>
                </>
              )}
            </div>
          )
        })()}
    </div>
  )
}

/** Pojedynczy kafelek w grupie — z własnym wyborem wersji i treścią. */
function GroupMember({
  groupId,
  index,
  conceptId,
  versionId,
}: {
  groupId: string
  index: number
  conceptId: string
  versionId: string | null
}) {
  const ctx = useContext(CanvasCtx)
  const typy = useBlockTypes()
  const concept = useLiveQuery(() => db.concepts.get(conceptId), [conceptId])
  const versions =
    useLiveQuery(
      () => db.versions.where('conceptId').equals(conceptId).toArray(),
      [conceptId],
    ) ?? []
  if (!concept) return <div className="group-member">(usunięty kafelek)</div>
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  const version =
    sorted.find((v) => v.id === versionId) ??
    sorted.find((v) => v.id === concept.currentVersionId)
  return (
    <div className="group-member">
      <div className="group-member-head">
        <span className="type-mini" data-typ={concept.type} style={typy.style(concept.type)}>
          {typy.short(concept.type)}
        </span>
        <span className="group-member-name">{concept.name}</span>
        <select
          className="path-node-version nodrag group-member-version"
          value={versionId ?? ''}
          title="Wersja użyta w tej ścieżce"
          onChange={(e) => ctx.setPartVersion(groupId, index, e.target.value || null)}
        >
          <option value="">zawsze bieżąca</option>
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label ?? `v${v.version}`}
            </option>
          ))}
        </select>
        <button
          className="folder-action nodrag"
          title="Wyjmij ten kafelek z grupy"
          onClick={() => ctx.removeFusionPart(groupId, index)}
        >
          ×
        </button>
      </div>
      <NodeBody html={renderMarkdown(version?.content ?? '')} />
    </div>
  )
}

/** Grupa: kilka kafelków pokazanych razem pod wspólną nazwą nadaną w tej
 *  ścieżce. W bazie to nadal osobne kafelki — grupa jest tylko formą pokazania. */
function FusionNode({ id, data, selected }: NodeProps) {
  const ctx = useContext(CanvasCtx)
  const typy = useBlockTypes()
  const parts = (data.parts as { conceptId: string; versionId: string | null }[]) ?? []
  const type = (data.type as BlockType | undefined) ?? ''
  return (
    <div className={`path-node path-node-group ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <header className="path-node-head group-head">
        <select
          className="fusion-type nodrag"
          data-typ={type || undefined}
          style={type ? typy.style(type) : undefined}
          value={type}
          title="Czym jest grupa jako całość — wygląda wtedy jak zwykły blok tego typu"
          onChange={(e) => ctx.updateData(id, { type: e.target.value || undefined })}
        >
          <option value="">GRUPA</option>
          {typy.choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short}
            </option>
          ))}
        </select>
        <span
          className="group-name nodrag"
          title="Kliknij dwukrotnie, aby zmienić nazwę grupy"
          onDoubleClick={() => ctx.renameFusion(id)}
        >
          {(data.name as string) || 'Grupa bez nazwy'}
        </span>
        <button
          className="path-node-open nodrag"
          title="Dodaj kafelek do grupy"
          onClick={() => ctx.addFusionPart(id)}
        >
          +
        </button>
        <button
          className="path-node-open nodrag"
          title="Rozgrupuj z powrotem na osobne kafelki"
          onClick={() => ctx.unfuse(id)}
        >
          ⇱
        </button>
      </header>
      <div className="group-members">
        {parts.map((p, i) => (
          <GroupMember
            key={`${p.conceptId}-${i}`}
            groupId={id}
            index={i}
            conceptId={p.conceptId}
            versionId={p.versionId}
          />
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

/** Rozdział / podrozdział — nagłówek porządkujący ścieżkę. */
function HeadingNode({ id, data, selected }: NodeProps) {
  const ctx = useContext(CanvasCtx)
  const level = (data.level as 1 | 2 | 3) ?? 1
  const text = (data.text as string) ?? ''
  return (
    <div
      className={`path-node path-node-heading level-${level} ${selected ? 'selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <span className="heading-level nodrag" title="Poziom: rozdział → podrozdział → sekcja">
        <button onClick={() => ctx.updateData(id, { level: level === 3 ? 1 : level + 1 })}>
          {'§'.repeat(level)}
        </button>
      </span>
      <span className="heading-text">{text || 'Nowy rozdział…'}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

/** Kafelki opakowane w memo: przeciąganie jednego nie przerysowuje reszty
 *  (React Flow zmienia wtedy tylko jego wpis, więc props pozostałych są te same). */
const nodeTypes = {
  block: memo(BlockNode),
  text: memo(TextNode),
  comment: memo(CommentNode),
  fusion: memo(FusionNode),
  heading: memo(HeadingNode),
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

interface Props {
  pathId: string
  onClose: () => void
  onOpenConcept: (id: string) => void
  /** Skok do miejsca w PDF (klik w źródło pod treścią bloku). */
  onJumpToSource?: (ref: SourceRef) => void
  /** Kafelek, do którego ścieżka ma podskoczyć zaraz po otwarciu — z paska
   *  „w ścieżkach" w edytorze kafelka. */
  celKlocek?: string | null
  /** Czy to ta ścieżka jest zakotwiczona (przycisk powrotu w rogu). */
  zakotwiczona?: boolean
  onZakotwicz?: () => void
  /** Górny pasek okna — tam ląduje pasek ścieżki. */
  pasekCel?: HTMLElement | null
  pdfWidoczny?: boolean
  onPrzelaczPdf?: () => void
}

function CanvasInner({
  pathId,
  onClose,
  onOpenConcept,
  onJumpToSource,
  celKlocek,
  zakotwiczona,
  onZakotwicz,
  pasekCel,
  pdfWidoczny,
  onPrzelaczPdf,
}: Props) {
  const dlg = useDialogs()
  // przez pudełko, żeby `api` mapy zachowało stałą tożsamość (od niej zależy
  // płynność przeciągania kafelków — patrz komentarz przy useMemo niżej)
  const dlgRef = useRef(dlg)
  dlgRef.current = dlg
  const typy = useBlockTypes()
  /** Rodzaje kafelków, które mieszkają w ścieżce — przykłady, zadania.
   *  Lista jest w rękach użytkownika (edytor rodzajów), więc przyciski
   *  „nowy tutejszy" biorą się właśnie stąd, a nie z nazwy wpisanej w kod. */
  const tutejszeRodzaje = typy.choices.filter((t) => t.wSciezce)
  const [name, setName] = useState('')
  const [rfNodes, setRfNodes] = useState<Node[]>([])
  const [rfEdges, setRfEdges] = useState<Edge[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const loadedRef = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)

  // siatka: widoczność (zapamiętywana) + przyciąganie przy wciśniętym Shift
  const [showGrid, setShowGrid] = useState(
    () => localStorage.getItem('ui.pathGrid') === '1',
  )
  useEffect(() => {
    localStorage.setItem('ui.pathGrid', showGrid ? '1' : '0')
  }, [showGrid])
  const [shiftDown, setShiftDown] = useState(false)
  useEffect(() => {
    const dn = (e: KeyboardEvent) => e.key === 'Shift' && setShiftDown(true)
    const up = (e: KeyboardEvent) => e.key === 'Shift' && setShiftDown(false)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // pokazywanie powiązań między kafelkami (relacje z warstwy wiedzy)
  const [showRelations, setShowRelations] = useState(
    () => localStorage.getItem('ui.pathRelations') !== '0',
  )
  useEffect(() => {
    localStorage.setItem('ui.pathRelations', showRelations ? '1' : '0')
  }, [showRelations])
  const allRelations = useLiveQuery(() => db.relations.toArray(), []) ?? []

  // menu kontekstowe (prawy przycisk na pustym obszarze)
  const [ctxMenu, setCtxMenu] = useState<{
    sx: number
    sy: number
    fx: number
    fy: number
  } | null>(null)

  // menu kontekstowe kafelka (prawy przycisk na węźle)
  const [nodeMenu, setNodeMenu] = useState<{
    sx: number
    sy: number
    nodeId: string
    nodeType: string
  } | null>(null)

  // edytowana notatka/komentarz (okno edycji)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  /** Fuzja, do której dokładamy kafelek (otwiera okno wyboru). */
  const [fusionTarget, setFusionTarget] = useState<string | null>(null)
  /** Edytowana grupa (nazwa + czym ma być). */
  /** Który złożony kafelek jest właśnie komponowany. */
  const [komponowany, setKomponowany] = useState<string | null>(null)

  // tryb pisania w oknie notatki — jak w edytorze kafelka
  const [noteView, setNoteView] = useState<'wizualny' | 'kod' | 'podzial'>(() => {
    const v = localStorage.getItem('ui.noteView')
    return v === 'kod' || v === 'podzial' ? v : 'wizualny'
  })
  useEffect(() => {
    localStorage.setItem('ui.noteView', noteView)
  }, [noteView])

  // nazwy pojęć do podpowiedzi wiki-linków w notatkach
  const allConcepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  // Wersje i strony wczytujemy tylko wtedy, gdy naprawdę są potrzebne (okno
  // edycji grupy). Stałe `useLiveQuery` na całych tabelach kazało kanwie
  // przerysować się przy każdym uderzeniu w klawisz w dowolnym kafelku —
  // stąd lagi przy pisaniu i przeciąganiu.
  const conceptNamesRef = useRef<string[]>([])
  conceptNamesRef.current = allConcepts.map((c) => c.name)
  const noteExtensions = useMemo(
    () => [
      markdown(),
      mdShortcuts,
      surroundSelection,
      wrapLines,
      wikiCompletion(() => conceptNamesRef.current),
    ],
    [],
  )

  // tryb widoku ścieżki: mapa (canvas) / linia (doklejanie) / skrypt (odczyt)
  /** Tryb zakryty: kafelki są, ale treści nie widać — odsłania się ją
   *  kliknięciem, sprawdzając po kolei, ile się pamięta. */
  const [zakryte, setZakryte] = useState(false)

  const [mode, setMode] = useState<'map' | 'linear' | 'script'>(() => {
    const m = localStorage.getItem('ui.pathMode')
    return m === 'linear' || m === 'script' ? m : 'map'
  })
  // Skok „do tego kafelka w tej ścieżce" ma sens w Linii — tam widać, co jest
  // przed nim i za nim. Na Mapie kafelek bywa gdzieś w rogu tablicy.
  useEffect(() => {
    if (celKlocek) setMode('linear')
  }, [celKlocek])
  useEffect(() => {
    localStorage.setItem('ui.pathMode', mode)
  }, [mode])
  // znacznik dla reguł drukowania (drukujemy tylko treść skryptu)
  useEffect(() => {
    document.body.classList.toggle('script-mode', mode === 'script')
    return () => document.body.classList.remove('script-mode')
  }, [mode])

  // tytuł karty = nazwa ścieżki w widoku skryptu (ładna nazwa pliku PDF)
  useEffect(() => {
    if (mode !== 'script') return
    document.title = `${name || 'Skrypt'} — Kompendium`
    return () => {
      document.title = 'Kompendium'
    }
  }, [mode, name])

  /** Cofanie i ponawianie w obrębie ścieżki (Ctrl+Z / Ctrl+Shift+Z, Ctrl+Y).
   *
   *  Zapamiętujemy kolejne stany układu — kafelki i strzałki. Obejmuje to
   *  wszystko, co ścieżka ma własnego: usunięcie kafelka, scalenie i
   *  rozdzielenie, przeniesienie, dołożenie rozdziału czy notatki, a od
   *  kiedy tekst mieszka w ścieżce — także pisanie. NIE obejmuje zmian w
   *  bibliotece; tam kafelki żyją własnym życiem.
   *
   *  Zdjęcia robimy z opóźnieniem, żeby całe zdanie było jednym krokiem, a
   *  nie trzydziestoma. */
  const historiaRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const przyszloscRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  /** Ustawione, gdy zmiana pochodzi z cofania — wtedy nie zapisujemy jej. */
  const cofamyRef = useRef(false)
  const zdjecieRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!loadedRef.current) return
    if (cofamyRef.current) {
      cofamyRef.current = false
      return
    }
    window.clearTimeout(zdjecieRef.current)
    zdjecieRef.current = window.setTimeout(() => {
      const ost = historiaRef.current[historiaRef.current.length - 1]
      if (ost && ost.nodes === rfNodes && ost.edges === rfEdges) return
      historiaRef.current.push({ nodes: rfNodes, edges: rfEdges })
      // pamiętamy sto kroków wstecz — dalej i tak nikt nie sięga
      if (historiaRef.current.length > 100) historiaRef.current.shift()
      przyszloscRef.current = []
    }, 400)
    return () => window.clearTimeout(zdjecieRef.current)
  }, [rfNodes, rfEdges])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const z = e.key === 'z' || e.key === 'Z'
      if (!(e.ctrlKey || e.metaKey) || (!z && e.key !== 'y')) return
      // w polu tekstowym cofanie należy do edytora — on wie o literach
      const cel = e.target as Element | null
      if (cel?.closest('.tiptap, .cm-content, input, textarea')) return
      const wPrzod = e.key === 'y' || (z && e.shiftKey)
      const skad = wPrzod ? przyszloscRef.current : historiaRef.current
      // ostatni wpis historii to stan bieżący — cofamy do przedostatniego
      if (!wPrzod && skad.length < 2) return
      if (wPrzod && skad.length < 1) return
      e.preventDefault()
      window.clearTimeout(zdjecieRef.current)
      cofamyRef.current = true
      if (wPrzod) {
        const stan = przyszloscRef.current.pop()!
        historiaRef.current.push(stan)
        setRfNodes(stan.nodes)
        setRfEdges(stan.edges)
      } else {
        przyszloscRef.current.push(historiaRef.current.pop()!)
        const stan = historiaRef.current[historiaRef.current.length - 1]
        setRfNodes(stan.nodes)
        setRfEdges(stan.edges)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Escape zamyka okno notatki i menu kontekstowe
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setEditingNote(null)
      setCtxMenu(null)
      setNodeMenu(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // wczytaj ścieżkę
  useEffect(() => {
    loadedRef.current = false
    ;(async () => {
      const p = await db.paths.get(pathId)
      if (!p) return
      setName(p.name)
      setRfNodes(p.nodes.map(toRfNode))
      setRfEdges(p.edges.map(toRfEdge))
      loadedRef.current = true
    })()
  }, [pathId])

  /** Wszystko, co to płótno kiedykolwiek miało u siebie. Dzięki temu kafelek
   *  usunięty przed autozapisem nie wraca zza grobu, a naprawdę nowy — wraca
   *  do gry (patrz niżej). */
  const kiedysZnaneRef = useRef<Set<string>>(new Set())
  for (const n of rfNodes) kiedysZnaneRef.current.add(n.id)

  // Kafelek może dojść z zewnątrz: upuszczeniem na ścieżkę w liście po lewej.
  // Płótno trzyma swój stan w pamięci, więc bez tego taki kafelek przepadałby
  // przy najbliższym autozapisie — nadpisywalibyśmy bazę tym, co mamy u siebie.
  const zBazy = useLiveQuery(() => db.paths.get(pathId), [pathId])
  useEffect(() => {
    if (!loadedRef.current || !zBazy) return
    const nowe = zBazy.nodes.filter((n) => !kiedysZnaneRef.current.has(n.id))
    if (!nowe.length) return
    const noweId = new Set(nowe.map((n) => n.id))
    setRfNodes((ns) => [...ns, ...nowe.map(toRfNode)])
    setRfEdges((es) => {
      const znane = new Set(es.map((e) => e.id))
      const doda = zBazy.edges.filter(
        (e) => !znane.has(e.id) && (noweId.has(e.from) || noweId.has(e.to)),
      )
      if (!doda.length) return es
      // Kafelek wstawiony POMIĘDZY rozcina dawną strzałkę a→b. Płótno wciąż ją
      // ma u siebie, więc bez tego kafelek stałby w dwóch miejscach naraz.
      const mostki = new Set<string>()
      for (const id of noweId) {
        const przed = zBazy.edges.find((e) => e.to === id)?.from
        const po = zBazy.edges.find((e) => e.from === id)?.to
        if (przed && po) mostki.add(`${przed}→${po}`)
      }
      return [...es.filter((e) => !mostki.has(`${e.source}→${e.target}`)), ...doda.map(toRfEdge)]
    })
  }, [zBazy])

  // autozapis
  useEffect(() => {
    if (!loadedRef.current) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      updatePath(pathId, {
        nodes: rfNodes.map(fromRfNode),
        edges: rfEdges.map(fromRfEdge),
      })
    }, 500)
  }, [rfNodes, rfEdges, pathId])

  /** Zestaw akcji dla kafelków. MUSI mieć stałą tożsamość — inaczej każdy
   *  render mapy (a przy przeciąganiu jest ich kilkadziesiąt na sekundę)
   *  przerysowuje wszystkie kafelki, bo to wartość kontekstu. Stan czytamy
   *  przez referencje, żeby nie trzeba go było wpisywać w zależności. */
  const edgesRef = useRef(rfEdges)
  edgesRef.current = rfEdges

  const api: CanvasApi = useMemo(() => ({
    updateData: (id, patch) =>
      setRfNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      ),
    edgeOrderInfo: (edgeId, source) => {
      const sibs = siblingsSorted(source, edgesRef.current, nodesRef.current)
      return { index: sibs.findIndex((e) => e.id === edgeId) + 1, count: sibs.length }
    },
    cycleEdgePriority: (edgeId) =>
      setRfEdges((es) => {
        const edge = es.find((e) => e.id === edgeId)
        if (!edge) return es
        const sibs = siblingsSorted(edge.source, es, nodesRef.current)
        const idx = sibs.findIndex((e) => e.id === edgeId)
        const reordered = [...sibs]
        reordered.splice(idx, 1)
        if (idx < sibs.length - 1) {
          reordered.splice(idx + 1, 0, edge) // n → n+1 (o pozycję później)
        } else {
          reordered.unshift(edge) // z ostatniej pozycji wraca na początek
        }
        const prio = new Map(reordered.map((e, i) => [e.id, i + 1]))
        return es.map((e) =>
          prio.has(e.id)
            ? { ...e, data: { ...e.data, priority: prio.get(e.id) } }
            : e,
        )
      }),
    unfuse: async (id) => {
      const f = nodesRef.current.find((n) => n.id === id)
      if (!f) return
      // Złożony tekst to praca użytkownika — przy rozdzieleniu NIE ginie:
      // zostaje w ścieżce jako notatka. Kasować go wolno tylko ręcznie.
      const zlozony = typeof f.data.content === 'string' ? f.data.content.trim() : ''
      if (zlozony) {
        const ok = await dlgRef.current.confirm({
          title: `Rozdzielić „${(f.data.name as string) || 'złożony kafelek'}"?`,
          message:
            'Wrócą osobne kafelki z biblioteki, a złożony tekst zostanie w ścieżce ' +
            'jako notatka — nic nie przepada. Same kafelki są nietknięte.',
          confirmLabel: 'Rozdziel',
        })
        if (!ok) return
      }
      const parts = (f.data.parts as FusionPart[]) ?? []
      const blocks: Node[] = parts.map((p, i) => ({
        id: crypto.randomUUID(),
        type: 'block',
        position: { x: f.position.x + i * 30, y: f.position.y + i * 220 },
        // uwolniony kafelek zabiera ze sobą tekst, który napisano mu w grupie
        data: {
          conceptId: p.conceptId,
          versionId: p.versionId,
          subpageId: p.subpageId ?? null,
          wlasneTresci: p.wlasneTresci,
        },
      }))
      const notatka: Node[] = zlozony
        ? [
            {
              id: crypto.randomUUID(),
              type: 'text',
              position: { x: f.position.x - 40, y: f.position.y - 40 },
              data: { text: zlozony },
            },
          ]
        : []
      setRfNodes((ns) => [...ns.filter((n) => n.id !== id), ...notatka, ...blocks])
      // Łańcuch trzeba zszyć: poprzednik → notatka → uwolnione po kolei →
      // następnik. Notatka ze złożonym tekstem wchodzi w ciąg, a nie zostaje
      // luzem obok — inaczej wyglądałaby na zgubioną.
      setRfEdges((es) => {
        const przed = es.filter((e) => e.target === id).map((e) => e.source)
        const po = es.filter((e) => e.source === id).map((e) => e.target)
        const rest = es.filter((e) => e.source !== id && e.target !== id)
        const ciag = [...notatka, ...blocks]
        const dodane: Edge[] = []
        for (const p of przed) dodane.push(mkEdge(p, ciag[0].id))
        for (let i = 0; i < ciag.length - 1; i++) {
          dodane.push(mkEdge(ciag[i].id, ciag[i + 1].id))
        }
        for (const n of po) dodane.push(mkEdge(ciag[ciag.length - 1].id, n))
        return [...rest, ...dodane]
      })
    },
    renameFusion: (id) => setKomponowany(id),
    addFusionPart: (id) => setFusionTarget(id),
    setPartVersion: (id, index, versionId) =>
      setRfNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n
          const parts = [
            ...((n.data.parts as { conceptId: string; versionId: string | null }[]) ?? []),
          ]
          parts[index] = { ...parts[index], versionId }
          return { ...n, data: { ...n.data, parts } }
        }),
      ),
    removeFusionPart: (id, index) =>
      setRfNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n
          const parts = [
            ...((n.data.parts as { conceptId: string; versionId: string | null }[]) ?? []),
          ]
          parts.splice(index, 1)
          return { ...n, data: { ...n.data, parts } }
        }),
      ),
    openConcept: onOpenConcept,
  }), [onOpenConcept])

  /** Części kafelka albo grupy — do składania grup z jednego i drugiego. */
  /** Składniki kafelka przed scaleniem. Kafelek wnosi ze sobą WSZYSTKO, co
   *  ma własnego — wybraną stronę i tekst napisany w ścieżce. Bez tego
   *  scalenie po cichu zjadałoby to, co użytkownik zdążył napisać. */
  const partsOf = (n: Node): FusionPart[] =>
    n.type === 'fusion'
      ? ((n.data.parts as FusionPart[]) ?? [])
      : n.type === 'block'
        ? [
            {
              conceptId: n.data.conceptId as string,
              versionId: (n.data.versionId as string | null) ?? null,
              subpageId: (n.data.subpageId as string | null) ?? null,
              wlasneTresci: n.data.wlasneTresci as WlasneTresci | undefined,
            },
          ]
        : []

  /** Scala wskazane kafelki (kafelki i istniejące grupy) w jedną grupę,
   *  zachowując podaną kolejność. Kafelki w bazie zostają nietknięte. */
  const groupNodes = async (orderedIds: string[]) => {
    const chosen = orderedIds
      .map((id) => rfNodes.find((n) => n.id === id))
      .filter((n): n is Node => !!n && (n.type === 'block' || n.type === 'fusion'))
    if (chosen.length < 2) return

    // Nazwy nie pytamy osobnym okienkiem — nadaje się ją na ekranie
    // komponowania, tam gdzie i tak trzeba zdecydować, co w kafelku wyląduje.
    const existing = chosen.find((n) => n.type === 'fusion')
    const name = existing ? (existing.data.name as string) : ''

    const parts: FusionPart[] = []
    for (const n of chosen) {
      for (const p of partsOf(n)) {
        if (!parts.some((x) => x.conceptId === p.conceptId)) parts.push(p)
      }
    }

    // typ całości: z grupy, a przy nowej — gdy wszystkie kafelki są jednakowe
    const partTypes = parts.map(
      (p) => allConcepts.find((c) => c.id === p.conceptId)?.type,
    )
    const commonType =
      partTypes.length > 0 && partTypes.every((t) => t && t === partTypes[0])
        ? partTypes[0]
        : undefined
    const type = existing ? (existing.data.type as BlockType | undefined) : commonType

    const gid = existing?.id ?? crypto.randomUUID()
    const position = existing?.position ?? {
      x: chosen.reduce((s, n) => s + n.position.x, 0) / chosen.length,
      y: chosen.reduce((s, n) => s + n.position.y, 0) / chosen.length,
    }
    const gone = new Set(chosen.map((n) => n.id))
    const group: Node = {
      id: gid,
      type: 'fusion',
      position,
      data: {
        name,
        type,
        parts,
        // NOWE scalenie zaczyna się od PUSTEGO kafelka: to na ekranie
        // komponowania wybiera się, co w nim wyląduje. (Brak pola znaczy
        // co innego — „blok sprzed przebudowy", który pokazuje sklejkę
        // materiałów; dlatego pusty tekst zapisujemy wprost.)
        //
        // Dołączanie do istniejącego bloku niczego nie nadpisuje.
        ...(existing
          ? {
              content: existing.data.content,
              strony: existing.data.strony,
              zrodla: existing.data.zrodla,
            }
          : { content: '' }),
      },
    }

    // Miejsce grupy w łańcuchu: tam, gdzie stał najwcześniejszy z jej członków.
    // Potrzebne, bo scalać wolno kafelki NIE po kolei — a wtedy zwykłe
    // przepięcie strzałek na grupę robi z sąsiada pętlę (G → Gamma → G)
    // i cały dalszy ciąg ścieżki wypada z porządku.
    const kolejnosc = topoOrder(rfNodes.map(fromRfNode), rfEdges.map(fromRfEdge))
    const miejsce = new Map(kolejnosc.map((n, i) => [n.id, i]))
    const gPos = Math.min(...chosen.map((n) => miejsce.get(n.id) ?? 0))

    setRfNodes((ns) => [...ns.filter((n) => !gone.has(n.id)), group])
    // scalenie to początek komponowania, a nie jego koniec
    setKomponowany(gid)
    setRfEdges((es) => {
      const rewired = es
        .map((e) => ({
          ...e,
          source: gone.has(e.source) ? gid : e.source,
          target: gone.has(e.target) ? gid : e.target,
        }))
        .filter((e) => e.source !== e.target)
        // strzałki wstecz — to one robiły pętlę; kafelek, który był pomiędzy
        // scalanymi, po prostu ląduje za grupą
        .filter((e) => {
          if (e.target === gid) return (miejsce.get(e.source) ?? 0) < gPos
          if (e.source === gid) return (miejsce.get(e.target) ?? 0) > gPos
          return true
        })
      const seen = new Set<string>()
      const bezPowtorek = rewired.filter((e) => {
        const k = `${e.source}->${e.target}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })

      // Kafelek, który stracił wszystko, co go poprzedzało, doczepiamy z
      // powrotem — inaczej wyglądałby na zgubiony.
      const zostali = kolejnosc.filter((n) => !gone.has(n.id))
      const maWejscie = new Set(bezPowtorek.map((e) => e.target))
      const mialWejscie = new Set(es.map((e) => e.target))
      const dodatkowe: Edge[] = []
      let poprzedni: string = gPos === 0 ? gid : (zostali[0]?.id ?? gid)
      for (const n of [...zostali.slice(gPos === 0 ? 0 : 1)]) {
        if (mialWejscie.has(n.id) && !maWejscie.has(n.id) && n.id !== poprzedni) {
          dodatkowe.push(mkEdge(poprzedni, n.id))
          maWejscie.add(n.id)
        }
        poprzedni = n.id
      }
      return [...bezPowtorek, ...dodatkowe]
    })
  }

  /** Mapa: scal zaznaczone kafelki (kolejność wg położenia). */
  const handleFuse = () => {
    const sel = rfNodes
      .filter((n) => selected.includes(n.id) && (n.type === 'block' || n.type === 'fusion'))
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    groupNodes(sel.map((n) => n.id))
  }

  const addTextAt = (fx: number, fy: number) => {
    setRfNodes((ns) => [
      ...ns,
      { id: crypto.randomUUID(), type: 'text', position: { x: fx, y: fy }, data: { text: '' } },
    ])
  }

  /** Tworzy nowe pojęcie w bazie i od razu kładzie jego kafelek na mapie. */
  const addBlockAt = async (fx: number, fy: number) => {
    const conceptId = await createConcept()
    setRfNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'block',
        position: { x: fx, y: fy },
        data: { conceptId, versionId: null },
      },
    ])
  }

  /** Kafelek należący do ścieżki (przykład, zadanie…). Rodzi się tutaj, tutaj
   *  mieszka i nie pokazuje się w bibliotece — ścieżka jest jego folderem. */
  const nowyTutejszy = async (typeId: string) => {
    const conceptId = await createConcept(typeId, pathId)
    await updateConcept(conceptId, { name: typy.label(typeId) })
    return conceptId
  }

  const addExampleAt = async (fx: number, fy: number, typeId: string) => {
    const conceptId = await nowyTutejszy(typeId)
    setRfNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'block',
        position: { x: fx, y: fy },
        data: { conceptId, versionId: null },
      },
    ])
  }

  const handleAddText = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    const pos = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2,
    })
    addTextAt(pos.x, pos.y)
  }

  /** Rozdział na mapie — nazwa od razu w oknie pytania (jak przy folderach). */
  const addHeadingAt = async (fx: number, fy: number, level: 1 | 2 | 3 = 1) => {
    const label = level === 1 ? 'rozdziału' : level === 2 ? 'podrozdziału' : 'sekcji'
    const text = await dlg.prompt({ title: `Nazwa ${label}`, confirmLabel: 'Dodaj' })
    if (!text) return
    setRfNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'heading',
        position: { x: fx, y: fy },
        data: { text: text.trim(), level },
      },
    ])
  }

  const handleAddHeading = (level: 1 | 2 | 3 = 1) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    const pos = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2,
    })
    addHeadingAt(pos.x, pos.y, level)
  }

  const addCommentAt = (fx: number, fy: number) => {
    setRfNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'comment',
        position: { x: fx, y: fy },
        data: { text: '' },
      },
    ])
  }

  /** Kafelki należące do tej ścieżki — przykłady zrobione w jej środku.
   *  Nie ma ich w bibliotece po lewej, więc ścieżka jest ich jedynym domem. */
  const wlasneKlockiRef = useRef<Set<string>>(new Set())
  wlasneKlockiRef.current = new Set(
    allConcepts.filter((c) => c.pathId === pathId).map((c) => c.id),
  )

  /** Kafelki, których dotyka segment (fuzja ma po jednym na składnik). */
  const klockiSegmentu = (n: Node | undefined): string[] => {
    if (!n) return []
    const lista: string[] = []
    if (typeof n.data.conceptId === 'string') lista.push(n.data.conceptId)
    for (const p of (n.data.parts as FusionPart[] | undefined) ?? []) lista.push(p.conceptId)
    return lista
  }

  /** Przykład wyjęty ze ścieżki wraca do biblioteki. Nie kasujemy go — po
   *  usunięciu z jedynego miejsca, w którym był widoczny, zniknąłby na dobre. */
  const wypuscZeSciezki = useCallback((usuwane: string[]) => {
    const zostaja = new Set(
      nodesRef.current
        .filter((n) => !usuwane.includes(n.id))
        .flatMap((n) => klockiSegmentu(n)),
    )
    const doBiblioteki = new Set(
      usuwane
        .flatMap((id) => klockiSegmentu(nodesRef.current.find((n) => n.id === id)))
        .filter((c) => wlasneKlockiRef.current.has(c) && !zostaja.has(c)),
    )
    for (const c of doBiblioteki) releaseConceptToLibrary(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Usuwa kafelek ze ścieżki (kafelek zostaje w bazie) wraz z jego strzałkami. */
  const removeNode = (id: string) => {
    wypuscZeSciezki([id])
    setRfNodes((ns) => ns.filter((n) => n.id !== id))
    setRfEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
  }

  // -------------------------------------------------------------------------
  // Operacje łańcuchowe trybu liniowego
  // -------------------------------------------------------------------------

  const mkEdge = (source: string, target: string): Edge => ({
    id: crypto.randomUUID(),
    source,
    target,
    type: 'ordered',
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  })

  /** Zmierzona wysokość kafelka (React Flow podaje ją po narysowaniu). */
  const heightOf = (n: Node | undefined) => n?.measured?.height ?? 180

  /** Pozycja na mapie dla segmentu wstawianego między sąsiadów — pod spodem
   *  poprzednika, z zapasem na jego rzeczywistą wysokość. */
  const positionBetween = (afterId: string | null, beforeId: string | null) => {
    const nodeOf = (id: string | null) =>
      id ? rfNodes.find((n) => n.id === id) : undefined
    const a = nodeOf(afterId)
    const b = nodeOf(beforeId)
    if (a && b) {
      return { x: a.position.x, y: (a.position.y + b.position.y) / 2 }
    }
    if (a) return { x: a.position.x, y: a.position.y + heightOf(a) + 60 }
    if (b) return { x: b.position.x, y: b.position.y - heightOf(b) - 60 }
    return { x: 120, y: 80 }
  }

  /** Przesuwa pozycję w dół, dopóki nachodzi na istniejący kafelek —
   *  nowe kafelki nie lądują wtedy jeden na drugim. */
  const freeSpot = (x: number, y: number) => {
    const collides = (px: number, py: number) =>
      rfNodes.some((n) => {
        const w = n.measured?.width ?? 300
        const h = heightOf(n)
        return (
          px < n.position.x + w + 24 &&
          px + 300 + 24 > n.position.x &&
          py < n.position.y + h + 24 &&
          py + 160 + 24 > n.position.y
        )
      })
    let py = y
    for (let i = 0; i < 40 && collides(x, py); i++) py += 60
    return { x, y: py }
  }

  /** Układa wszystkie kafelki w jedną kolumnę w kolejności skryptu,
   *  z odstępami wg ich rzeczywistej wysokości. Komentarze idą na margines. */
  const autoArrange = () => {
    const ordered = topoOrder(rfNodes.map(fromRfNode), rfEdges.map(fromRfEdge))
    const byId = new Map(rfNodes.map((n) => [n.id, n]))
    const next = new Map<string, { x: number; y: number }>()
    let y = 40
    for (const o of ordered) {
      const n = byId.get(o.id)
      if (!n) continue
      if (n.type === 'comment') {
        // notatka boczna obok bieżącego miejsca w kolumnie
        next.set(n.id, { x: 560, y })
        continue
      }
      next.set(n.id, { x: 80, y })
      y += heightOf(n) + 50
    }
    setRfNodes((ns) => ns.map((n) => (next.has(n.id) ? { ...n, position: next.get(n.id)! } : n)))
    window.setTimeout(() => fitView({ maxZoom: 1, padding: 0.15, duration: 300 }), 60)
  }

  /** Wstawia węzeł w łańcuch: after → nowy → before (rozcina strzałkę after→before). */
  const chainInsert = (node: Node, afterId: string | null, beforeId: string | null) => {
    setRfNodes((ns) => [...ns, node])
    setRfEdges((es) => {
      let rest = es
      if (afterId && beforeId) {
        rest = rest.filter((e) => !(e.source === afterId && e.target === beforeId))
      }
      const add: Edge[] = []
      if (afterId) add.push(mkEdge(afterId, node.id))
      if (beforeId) add.push(mkEdge(node.id, beforeId))
      return [...rest, ...add]
    })
  }

  /** Usuwa segment i zszywa łańcuch (poprzednik → następnik). */
  const removeSegmentHeal = (id: string) => {
    wypuscZeSciezki([id])
    setRfEdges((es) => {
      const inc = es.filter((e) => e.target === id).map((e) => e.source)
      const outs = es.filter((e) => e.source === id).map((e) => e.target)
      let rest = es.filter((e) => e.source !== id && e.target !== id)
      if (
        inc.length === 1 &&
        outs.length === 1 &&
        inc[0] !== outs[0] &&
        !rest.some((e) => e.source === inc[0] && e.target === outs[0])
      ) {
        rest = [...rest, mkEdge(inc[0], outs[0])]
      }
      return rest
    })
    setRfNodes((ns) => ns.filter((n) => n.id !== id))
  }

  /** Przenosi istniejący segment w inne miejsce łańcucha. */
  const moveSegment = (segId: string, afterId: string | null, beforeId: string | null) => {
    if (segId === afterId || segId === beforeId) return
    if (!rfNodes.some((n) => n.id === segId)) return
    const pos = positionBetween(afterId, beforeId)
    setRfEdges((es) => {
      const inc = es.filter((e) => e.target === segId).map((e) => e.source)
      const outs = es.filter((e) => e.source === segId).map((e) => e.target)
      let rest = es.filter((e) => e.source !== segId && e.target !== segId)
      if (
        inc.length === 1 &&
        outs.length === 1 &&
        inc[0] !== outs[0] &&
        !rest.some((e) => e.source === inc[0] && e.target === outs[0])
      ) {
        rest = [...rest, mkEdge(inc[0], outs[0])]
      }
      if (afterId && beforeId) {
        rest = rest.filter((e) => !(e.source === afterId && e.target === beforeId))
      }
      const add: Edge[] = []
      if (afterId) add.push(mkEdge(afterId, segId))
      if (beforeId) add.push(mkEdge(segId, beforeId))
      return [...rest, ...add]
    })
    setRfNodes((ns) => ns.map((n) => (n.id === segId ? { ...n, position: pos } : n)))
  }

  /** Tekst pisany w ścieżce ląduje w WĘŹLE ŚCIEŻKI, nie w kafelku.
   *
   *  Zmieniamy przez funkcję, a nie przez gotowy obiekt: przy szybkim pisaniu
   *  i przełączaniu wersji zapis zbudowany z danych sprzed chwili potrafiłby
   *  zgubić wcześniejszy wpis dla innej wersji. Do bazy trafia to zwykłym
   *  autozapisem układu ścieżki. */
  /** Odłożony zapis — jeden na kafelek i wersję.
   *
   *  Bez tego każde naciśnięcie klawisza zmienia węzły ścieżki, a to znaczy
   *  przeliczenie kolejności całej ścieżki i zbudowanie wszystkich ramek od
   *  nowa. Pole tekstowe i tak trzyma to, co piszesz, więc nikt nie zauważa,
   *  że ścieżka dowiaduje się o tym ułamek sekundy później. */
  const odlozoneRef = useRef(new Map<string, { t: number; akcja: () => void }>())
  const odloz = useCallback((klucz: string, akcja: () => void) => {
    const stary = odlozoneRef.current.get(klucz)
    if (stary) window.clearTimeout(stary.t)
    const t = window.setTimeout(() => {
      odlozoneRef.current.delete(klucz)
      akcja()
    }, 350)
    odlozoneRef.current.set(klucz, { t, akcja })
  }, [])
  useEffect(() => {
    const mapa = odlozoneRef.current
    // zamknięcie ścieżki nie może zjeść ostatniego zdania
    return () => {
      for (const { t, akcja } of mapa.values()) {
        window.clearTimeout(t)
        akcja()
      }
      mapa.clear()
    }
  }, [])

  const zapiszWlasna = useCallback(
    (nodeId: string, klucz: string, md: string) => {
      odloz(`${nodeId}|${klucz}`, () =>
        setRfNodes((ns) =>
          ns.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    wlasneTresci: {
                      ...((n.data.wlasneTresci as WlasneTresci | undefined) ?? {}),
                      [klucz]: md,
                    },
                  },
                }
              : n,
          ),
        ),
      )
    },
    [odloz],
  )

  /** Rozstrzyga, dokąd idzie pisanie w kafelku.
   *
   *  Zwykły kafelek: do ścieżki (biblioteka jest nietykalna — patrz zasada
   *  „ścieżka nie rusza kafelka"). Przykład należący do TEJ ścieżki: prosto do
   *  kafelka, bo nie ma go nigdzie indziej — tekst zapisany „obok" zostawiłby
   *  pusty kafelek, który po wyjęciu do biblioteki byłby czystą kartką. */
  const zapiszTresc = (
    nodeId: string,
    versionId: string,
    subpageId: string | null,
    md: string,
  ) => {
    const n = nodesRef.current.find((x) => x.id === nodeId)
    const cid = typeof n?.data.conceptId === 'string' ? n.data.conceptId : null
    if (cid && wlasneKlockiRef.current.has(cid)) {
      odloz(`${nodeId}|kafelek|${versionId}|${subpageId ?? ''}`, () => {
        if (subpageId) updateSubpage(subpageId, { content: md })
        else updateVersion(versionId, { content: md })
      })
      return
    }
    zapiszWlasna(nodeId, kluczWlasnej(versionId, subpageId), md)
  }

  /** Zapis treści ZŁOŻONEGO kafelka: strona główna albo jedna z jego stron.
   *
   *  Pierwszy zapis utrwala tekst w węźle. Do tej chwili blok pokazywał
   *  sklejkę z materiałów i w danych nie zmieniało się nic — dzięki temu
   *  ścieżki sprzed przebudowy wyglądają tak samo, dopóki się ich nie tknie. */
  const zapiszTrescBloku = useCallback(
    (nodeId: string, md: string, stronaId: string | null) => {
      odloz(nodeId + '|blok|' + (stronaId ?? 'tresc'), () =>
        setRfNodes((ns) =>
          ns.map((n) => {
            if (n.id !== nodeId) return n
            if (!stronaId) return { ...n, data: { ...n.data, content: md } }
            const strony = [...((n.data.strony as StronaBloku[]) ?? [])]
            const i = strony.findIndex((x) => x.id === stronaId)
            if (i < 0) return n
            strony[i] = { ...strony[i], content: md }
            return { ...n, data: { ...n.data, strony } }
          }),
        ),
      )
    },
    [odloz],
  )

  /** Porzucenie własnego tekstu kafelka. Kasuje coś, co użytkownik napisał,
   *  więc pyta — i mówi wprost, co się pojawi w zamian. */
  const wrocDoKlocka = useCallback(
    async (nodeId: string, klucz: string, index?: number) => {
      const ok = await dlgRef.current.confirm({
        title: 'Wrócić do treści kafelka?',
        message:
          'Tekst napisany w tej ścieżce zostanie porzucony, a kafelek zacznie ' +
          'pokazywać treść z biblioteki. Samego kafelka to nie zmienia.',
        confirmLabel: 'Wróć do treści z biblioteki',
        danger: true,
      })
      if (!ok) return
      const bez = (m: WlasneTresci | undefined) => {
        const nowe = { ...(m ?? {}) }
        delete nowe[klucz]
        return nowe
      }
      setRfNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          if (index === undefined) {
            return {
              ...n,
              data: { ...n.data, wlasneTresci: bez(n.data.wlasneTresci as WlasneTresci) },
            }
          }
          const parts = [...((n.data.parts as FusionPart[]) ?? [])]
          const p = parts[index]
          if (!p) return n
          parts[index] = { ...p, wlasneTresci: bez(p.wlasneTresci) }
          return { ...n, data: { ...n.data, parts } }
        }),
      )
    },
    [],
  )

  /** Tekst ze ścieżki idzie do biblioteki jako nowa wersja kafelka. Kafelek
   *  wraca wtedy do żywego podglądu, bo jego treść to już ten sam tekst. */
  const wyslijTekst = useCallback(
    async (
      nodeId: string,
      conceptId: string,
      versionId: string,
      subpageId: string | null,
      tekst: string,
    ) => {
      const ok = await dlgRef.current.confirm({
        title: 'Wysłać ten tekst do biblioteki?',
        message:
          'Powstanie nowa wersja kafelka i stanie się bieżąca. Dotychczasowa ' +
          'wersja zostaje. Ścieżki, które nie mają własnego tekstu tego ' +
          'kafelka, zaczną pokazywać nową wersję.',
        confirmLabel: 'Wyślij do biblioteki',
      })
      if (!ok) return
      const bylaBiezaca = (await db.concepts.get(conceptId))?.currentVersionId
      const { wersjaId, mapaStron } = await wyslijDoBiblioteki(
        conceptId,
        versionId,
        subpageId,
        tekst,
        pathId,
      )
      const wyslany = kluczWlasnej(versionId, subpageId)
      setRfNodes((ns) => {
        // pozostałe węzły tego kafelka: ich tekst nie może zniknąć z oczu
        const przypiete = bylaBiezaca
          ? przypnijTekstDoWersji(ns.map(fromRfNode), conceptId, bylaBiezaca)
          : null
        return ns.map((n, i) => {
          if (n.id !== nodeId) {
            const p = przypiete?.[i]
            if (p?.kind === 'block') return { ...n, data: { ...n.data, versionId: p.versionId } }
            if (p?.kind === 'fusion') return { ...n, data: { ...n.data, parts: p.parts } }
            return n
          }
          // reszta tekstów tej wersji przechodzi razem z nią na nową
          const wlasne: WlasneTresci = {}
          for (const [k, v] of Object.entries((n.data.wlasneTresci as WlasneTresci) ?? {})) {
            if (k === wyslany) continue
            if (!k.startsWith(`${versionId}:`)) {
              wlasne[k] = v
              continue
            }
            const strona = k.slice(versionId.length + 1) || null
            wlasne[kluczWlasnej(wersjaId, strona ? (mapaStron[strona] ?? strona) : null)] = v
          }
          const strona = n.data.subpageId as string | null | undefined
          return {
            ...n,
            data: {
              ...n.data,
              wlasneTresci: wlasne,
              versionId: null,
              subpageId: strona ? (mapaStron[strona] ?? strona) : strona,
            },
          }
        })
      })
    },
    [pathId],
  )

  /** Przenosi kilka segmentów naraz — każdy ląduje za poprzednim, więc
   *  wzajemna kolejność zaznaczenia zostaje zachowana. */
  const moveSegments = (ids: string[], afterId: string | null, beforeId: string | null) => {
    let po = afterId
    for (const id of ids) {
      if (id === beforeId) continue
      moveSegment(id, po, beforeId)
      po = id
    }
  }

  const linearDropConcept = (conceptId: string, afterId: string | null, beforeId: string | null) => {
    chainInsert(
      {
        id: crypto.randomUUID(),
        type: 'block',
        position: positionBetween(afterId, beforeId),
        data: { conceptId, versionId: null },
      },
      afterId,
      beforeId,
    )
  }

  /** Rozdział w widoku liniowym — wstawiany w łańcuch jak zwykły segment. */
  const linearAddHeading = async (
    level: 1 | 2 | 3,
    afterId: string | null,
    beforeId: string | null,
  ) => {
    const label = level === 1 ? 'rozdziału' : level === 2 ? 'podrozdziału' : 'sekcji'
    const text = await dlg.prompt({ title: `Nazwa ${label}`, confirmLabel: 'Dodaj' })
    if (!text) return
    chainInsert(
      {
        id: crypto.randomUUID(),
        type: 'heading',
        position: positionBetween(afterId, beforeId),
        data: { text: text.trim(), level },
      },
      afterId,
      beforeId,
    )
  }

  /** Wstawiony wprost w łańcuch Linii — bez chodzenia do biblioteki. */
  const linearAddExample = async (
    typeId: string,
    afterId: string | null,
    beforeId: string | null,
  ) => {
    const conceptId = await nowyTutejszy(typeId)
    chainInsert(
      {
        id: crypto.randomUUID(),
        type: 'block',
        position: positionBetween(afterId, beforeId),
        data: { conceptId, versionId: null },
      },
      afterId,
      beforeId,
    )
  }

  const linearAddNote = (
    kind: 'text' | 'comment',
    afterId: string | null,
    beforeId: string | null,
  ) => {
    const id = crypto.randomUUID()
    chainInsert(
      {
        id,
        type: kind,
        position: positionBetween(afterId, beforeId),
        data: { text: '' },
      },
      afterId,
      beforeId,
    )
    // W Linii nowa notatka nie otwiera okienka — pisze się ją na miejscu,
    // klikając w „pusta notatka". Okienko zostaje dla mapy, gdzie kafelek
    // jest za mały, żeby w nim pisać.
    if (mode !== 'linear') setEditingNote(id)
  }

  const handlePaneContextMenu = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    const sx = 'clientX' in e ? e.clientX : 0
    const sy = 'clientY' in e ? e.clientY : 0
    const pos = screenToFlowPosition({ x: sx, y: sy })
    setNodeMenu(null)
    setCtxMenu({ sx, sy, fx: pos.x, fy: pos.y })
  }

  const handleNodeContextMenu = (e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setCtxMenu(null)
    setNodeMenu({ sx: e.clientX, sy: e.clientY, nodeId: node.id, nodeType: node.type ?? '' })
  }

  const handleNodeDoubleClick = async (_: React.MouseEvent, node: Node) => {
    if (node.type === 'block') {
      onOpenConcept(node.data.conceptId as string)
    } else if (node.type === 'text' || node.type === 'comment') {
      setEditingNote(node.id)
    } else if (node.type === 'fusion') {
      setKomponowany(node.id)
    } else if (node.type === 'heading') {
      const text = await dlg.prompt({
        title: 'Nazwa rozdziału',
        value: (node.data.text as string) ?? '',
      })
      if (text) api.updateData(node.id, { text })
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    let payload: { kind: string; id: string } | null = null
    try {
      const raw = e.dataTransfer.getData(MIME)
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = null
    }
    if (!payload || payload.kind !== 'concept') return
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const pos = freeSpot(p.x, p.y)
    setRfNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'block',
        position: pos,
        data: { conceptId: payload!.id, versionId: null },
      },
    ])
  }

  const selectedBlocks = rfNodes.filter(
    (n) => selected.includes(n.id) && n.type === 'block',
  ).length

  // React Flow wymaga zmemoizowanych handlerów — inaczej wpada w pętlę renderowania.
  const onNodesChange = useCallback(
    (chs: NodeChange[]) => {
      // klawisz Delete też jest wyjęciem ze ścieżki — przykłady mają wtedy
      // wrócić do biblioteki, a nie zostać bezdomne
      const kasowane = chs.filter((c) => c.type === 'remove').map((c) => c.id)
      if (kasowane.length) wypuscZeSciezki(kasowane)
      setRfNodes((ns) => applyNodeChanges(chs, ns))
    },
    [wypuscZeSciezki],
  )
  const onEdgesChange = useCallback(
    // strzałki powiązań są tylko pokazywane — nie należą do ścieżki,
    // więc żadna ich zmiana nie może trafić do zapisu (id z przedrostkiem rel-)
    (chs: EdgeChange[]) =>
      setRfEdges((es) => applyEdgeChanges(chs.filter((c) => !isRelationChange(c)), es)),
    [],
  )
  const onConnect = useCallback(
    (c: Connection) =>
      setRfEdges((es) =>
        addEdge(
          {
            ...c,
            type: 'ordered',
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          },
          es,
        ),
      ),
    [],
  )
  /** Powiązania z warstwy wiedzy jako dodatkowe, przerywane strzałki między
   *  kafelkami tej ścieżki. Nie należą do ścieżki — są tylko pokazywane. */
  /** Odcisk „które kafelki pokazują które pojęcia" — bez pozycji, żeby
   *  przeciąganie kafelka nie przeliczało strzałek przy każdej klatce. */
  const nodeConceptSig = rfNodes
    .map((n) =>
      n.type === 'block'
        ? `${n.id}:${n.data.conceptId as string}`
        : n.type === 'fusion'
          ? `${n.id}:${((n.data.parts as { conceptId: string }[]) ?? [])
              .map((p) => p.conceptId)
              .join('+')}`
          : '',
    )
    .filter(Boolean)
    .join('|')
  const nodesRef = useRef(rfNodes)
  nodesRef.current = rfNodes

  const relationEdges: Edge[] = useMemo(() => {
    if (!showRelations) return []
    const rfNodes = nodesRef.current
    // kafelki (także kafelki schowane w grupie) wskazujące na dane pojęcie
    const nodesByConcept = new Map<string, string[]>()
    for (const n of rfNodes) {
      const ids =
        n.type === 'block'
          ? [n.data.conceptId as string]
          : n.type === 'fusion'
            ? ((n.data.parts as { conceptId: string }[]) ?? []).map((p) => p.conceptId)
            : []
      for (const cid of ids) {
        nodesByConcept.set(cid, [...(nodesByConcept.get(cid) ?? []), n.id])
      }
    }
    const out: Edge[] = []
    for (const r of allRelations) {
      for (const source of nodesByConcept.get(r.fromId) ?? []) {
        for (const target of nodesByConcept.get(r.toId) ?? []) {
          if (source === target) continue
          out.push({
            id: `${REL_PREFIX}${r.id}-${source}-${target}`,
            source,
            target,
            selectable: false,
            deletable: false,
            focusable: false,
            className: `relation-edge rel-${r.kind}`,
            label: RELATION_LABELS[r.kind].forward,
            markerEnd: isSymmetricRelation(r.kind)
              ? undefined
              : { type: MarkerType.Arrow, width: 16, height: 16 },
          })
        }
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRelations, nodeConceptSig, allRelations])

  /** Stabilna tożsamość listy — inaczej React Flow przy każdym renderze
   *  wgrywa nową tablicę do swojego stanu i potrafi wpaść w pętlę. */
  const allEdges = useMemo(
    () => (relationEdges.length ? [...rfEdges, ...relationEdges] : rfEdges),
    [rfEdges, relationEdges],
  )

  const onSelectionChange = useCallback(
    ({ nodes }: { nodes: Node[] }) =>
      setSelected((prev) => {
        const ids = nodes.map((n) => n.id)
        return prev.length === ids.length && prev.every((v, i) => v === ids[i])
          ? prev
          : ids
      }),
    [],
  )

  const pasekSciezki = (
      <header className="path-toolbar">
        <span className="path-ukosnik">/</span>
        <input
          className="input path-name"
          size={Math.max(name.length, 12)}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            updatePath(pathId, { name: e.target.value })
          }}
          placeholder="Nazwa ścieżki…"
        />
        {onZakotwicz && (
          <button
            className={`btn path-maly ${zakotwiczona ? 'btn-active' : ''}`}
            title={
              zakotwiczona
                ? 'Zdejmij kotwicę — zniknie przycisk powrotu'
                : 'Zakotwicz tę ścieżkę: przycisk powrotu w lewym górnym rogu i Alt+Z'
            }
            onClick={onZakotwicz}
          >
            <Icon name="anchor" size={1} />
          </button>
        )}
        <button className="btn btn-close path-maly" title="Zamknij ścieżkę" onClick={onClose}>
          ✕
        </button>
        <span className="path-odstep" />
        {mode === 'linear' && (
          <button
            className={`btn ${zakryte ? 'btn-active' : ''}`}
            title={
              zakryte
                ? 'Odkryj wszystko'
                : 'Tryb zakryty: widać, że kafelek jest, ale nie widać treści — przypominasz sobie i sprawdzasz kliknięciem'
            }
            onClick={() => setZakryte((z) => !z)}
          >
            <Icon name={zakryte ? 'odkryj' : 'zakryj'} size={1} />
            <span className="btn-napis">{zakryte ? 'Odkryj' : 'Zakryj treści'}</span>
          </button>
        )}
        <div className="view-switch">
          <button
            className={`btn ${mode === 'map' ? 'btn-active' : ''}`}
            title="Mapa: kafelki i strzałki na nieskończonej tablicy"
            onClick={() => setMode('map')}
          >
            Mapa
          </button>
          <button
            className={`btn ${mode === 'linear' ? 'btn-active' : ''}`}
            title="Linia: doklejanie segmentów skryptu jeden pod drugim"
            onClick={() => setMode('linear')}
          >
            Linia
          </button>
          <button
            className={`btn ${mode === 'script' ? 'btn-active' : ''}`}
            title="Skrypt: gotowy ciągły dokument (tylko odczyt)"
            onClick={() => setMode('script')}
          >
            Skrypt
          </button>
        </div>
        {mode === 'script' && (
          <button
            className="btn btn-primary"
            onClick={() => window.print()}
            title="Wydrukuj skrypt albo zapisz go jako PDF"
          >
            Drukuj / PDF
          </button>
        )}
        {onPrzelaczPdf && (
          <button
            className={`btn ${pdfWidoczny ? 'btn-active' : ''}`}
            title={pdfWidoczny ? 'Schowaj panel PDF' : 'Pokaż panel PDF'}
            onClick={onPrzelaczPdf}
          >
            PDF ▸
          </button>
        )}
      </header>
  )

  return (
    <section className="path-canvas">
      {pasekCel ? createPortal(pasekSciezki, pasekCel) : pasekSciezki}
      {mode === 'map' && (
        <div className="path-toolbar-tools">
          <button
            className="btn"
            onClick={handleAddText}
            title="Dodaj notatkę (tkankę łączną / intuicję)"
          >
            + Notatka
          </button>
          <button
            className="btn"
            onClick={() => {
              const rect = wrapRef.current?.getBoundingClientRect()
              const pos = screenToFlowPosition({
                x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2 + 60,
                y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2 + 60,
              })
              addCommentAt(pos.x, pos.y)
            }}
            title="Dodaj komentarz do ścieżki (nie trafia do skryptu)"
          >
            <Icon name="komentarz" size={1} /> Komentarz
          </button>
          <button
            className="btn"
            onClick={() => handleAddHeading(1)}
            title="Dodaj rozdział (dwuklik na kafelku zmienia nazwę, § zmienia poziom)"
          >
            <Icon name="rozdzial" size={1} /> Rozdział
          </button>
          <button
            className="btn"
            onClick={autoArrange}
            title="Ułóż kafelki w jedną kolumnę w kolejności skryptu, bez nakładania"
          >
            ⇅ Ułóż
          </button>
          <button
            className={`btn ${showRelations ? 'btn-active' : ''}`}
            onClick={() => setShowRelations((r) => !r)}
            title="Pokaż powiązania między kafelkami (zawieranie, skala, perspektywa) jako przerywane strzałki"
          >
            ⇢ Powiązania
          </button>
          <button
            className={`btn ${showGrid ? 'btn-active' : ''}`}
            onClick={() => setShowGrid((g) => !g)}
            title="Pokaż/ukryj siatkę (Shift podczas przesuwania przyciąga do linii)"
          >
            ⊞ Siatka
          </button>
          <button
            className="btn"
            onClick={handleFuse}
            disabled={selectedBlocks < 2}
            title="Scal zaznaczone kafelki w jeden bloczek (w tej ścieżce)"
          >
            <Icon name="scal" size={1} /> Scal ({selectedBlocks})
          </button>
        </div>
      )}
      {/* Podpowiedź tylko na Mapie: Linia to warsztat pisania, a Skrypt książka. */}
      {mode === 'map' && (
        <div className="path-hint">
          Przeciągnij kafelki z listy po lewej · łącz strzałkami (od dolnej kropki do górnej) ·
          prawy przycisk = nowy kafelek/notatka/komentarz · Ctrl+klik zaznacza wiele · Shift =
          przyciąganie do siatki · Delete usuwa
        </div>
      )}
      {mode === 'script' && (
        <ScriptBody
          pathId={pathId}
          onOpenConcept={onOpenConcept}
          onJumpToSource={onJumpToSource}
        />
      )}
      {mode === 'linear' && (
        <LinearView
          ordered={topoOrder(rfNodes.map(fromRfNode), rfEdges.map(fromRfEdge))}
          celKlocek={celKlocek}
          pathId={pathId}
          zakryte={zakryte}
          onDropConcept={linearDropConcept}
          onMoveSegment={moveSegment}
          onMoveSegments={moveSegments}
          onAddNote={linearAddNote}
          onAddExample={linearAddExample}
          onPaskiStron={(segId, paski) =>
            setRfNodes((ns) =>
              ns.map((x) =>
                x.id === segId ? { ...x, data: { ...x.data, paskiStron: paski } } : x,
              ),
            )
          }
          onEtykietaCzesci={(segId, index, etykieta) =>
            setRfNodes((ns) =>
              ns.map((x) => {
                if (x.id !== segId) return x
                const parts = [...((x.data.parts as FusionPart[]) ?? [])]
                if (!parts[index]) return x
                parts[index] = { ...parts[index], etykieta }
                return { ...x, data: { ...x.data, parts } }
              }),
            )
          }
          onKeepHere={(conceptId, tutaj) =>
            tutaj ? keepConceptInPath(pathId, conceptId) : releaseConceptToLibrary(conceptId)
          }
          onRemove={removeSegmentHeal}
          onEdit={(n) => {
            if (n.kind === 'block') onOpenConcept(n.conceptId)
            else if (n.kind === 'fusion') setKomponowany(n.id)
          }}
          onRenameSegment={(nodeId, nazwa) => api.updateData(nodeId, { nazwa })}
          /* Tekst pisany w ścieżce zostaje w ścieżce. Kafelek w bibliotece
             zachowuje swoją treść — poprawiona tutaj definicja nie zmienia
             tamtej i nie rozjeżdża innych ścieżek. */
          onEditBlock={(nodeId, versionId, subpageId, md) =>
            zapiszTresc(nodeId, versionId, subpageId, md)
          }
          onWyslijDoBiblioteki={wyslijTekst}
          onWrocDoKlocka={(nodeId, versionId, subpageId) =>
            wrocDoKlocka(nodeId, kluczWlasnej(versionId, subpageId))
          }
          onEditNote={(id, md) => api.updateData(id, { text: md })}
          onEditHeading={(id, text) => api.updateData(id, { text })}
          onPoziomRozdzialu={(id, level) => api.updateData(id, { level })}
          onRozmiarRozdzialu={(id, rozmiar) => api.updateData(id, { rozmiar })}
          onRenameFusion={(id, name) => api.updateData(id, { name })}
          onEditFusion={(id, md, stronaId) => zapiszTrescBloku(id, md, stronaId)}
          onUnfuse={(id) => api.unfuse(id)}
          onToggleSide={(id) => {
            const n = rfNodes.find((x) => x.id === id)
            const cur = (n?.data.side as 'left' | 'right' | undefined) ?? 'right'
            api.updateData(id, { side: cur === 'right' ? 'left' : 'right' })
          }}
          onSetSubpage={(segId, subpageId) => api.updateData(segId, { subpageId })}
          onSetVersion={(segId, versionId) => api.updateData(segId, { versionId })}
          onSetPartVersion={(segId, index, versionId) =>
            setRfNodes((ns) =>
              ns.map((n) => {
                if (n.id !== segId) return n
                const parts = [...((n.data.parts as FusionPart[]) ?? [])]
                parts[index] = { ...parts[index], versionId }
                return { ...n, data: { ...n.data, parts } }
              }),
            )
          }
          onSetPartSubpage={(segId, index, subpageId) =>
            setRfNodes((ns) =>
              ns.map((n) => {
                if (n.id !== segId) return n
                const parts = [...((n.data.parts as FusionPart[]) ?? [])]
                parts[index] = { ...parts[index], subpageId }
                return { ...n, data: { ...n.data, parts } }
              }),
            )
          }
          onAddHeading={linearAddHeading}
          onGroupWithNext={(segId) => {
            const chain = topoOrder(rfNodes.map(fromRfNode), rfEdges.map(fromRfEdge))
            const i = chain.findIndex((n) => n.id === segId)
            const next = chain[i + 1]
            if (next) groupNodes([segId, next.id])
          }}
          /* Kolejność bierzemy taką, jaką podała Linia — czyli tę, którą
             widać na ekranie. Mapa sortuje po położeniu kafelków, a w Linii
             położenie nic nie znaczy. */
          onFuseSelected={(ids) => groupNodes(ids)}
          onJumpToSource={onJumpToSource}
          onOpenConcept={onOpenConcept}
        />
      )}
      <div
        className="path-flow"
        ref={wrapRef}
        style={mode !== 'map' ? { display: 'none' } : undefined}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <CanvasCtx.Provider value={api}>
          <ReactFlow
            nodes={rfNodes}
            edges={allEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onPaneContextMenu={handlePaneContextMenu}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={() => {
              setCtxMenu(null)
              setNodeMenu(null)
            }}
            onMoveStart={() => {
              setCtxMenu(null)
              setNodeMenu(null)
            }}
            zoomOnDoubleClick={false}
            snapToGrid={shiftDown}
            snapGrid={[20, 20]}
            selectionKeyCode={null}
            deleteKeyCode={['Delete', 'Backspace']}
            connectionRadius={60}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
          >
            {showGrid ? (
              <Background variant={BackgroundVariant.Lines} gap={20} color="#e9e4d7" />
            ) : (
              <Background gap={22} />
            )}
            <Controls showInteractive={false} />
          </ReactFlow>
        </CanvasCtx.Provider>
        {ctxMenu && (
          <div
            className="path-ctxmenu"
            ref={clampMenu}
            style={{ left: ctxMenu.sx, top: ctxMenu.sy }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="path-ctxmenu-item"
              onClick={() => {
                addBlockAt(ctxMenu.fx, ctxMenu.fy)
                setCtxMenu(null)
              }}
            >
              🧱 Nowy kafelek tutaj
            </button>
            {tutejszeRodzaje.map((t) => (
              <button
                key={t.id}
                className="path-ctxmenu-item"
                title={`${t.label} mieszka w tej ścieżce — nie ma go w liście po lewej`}
                onClick={() => {
                  addExampleAt(ctxMenu.fx, ctxMenu.fy, t.id)
                  setCtxMenu(null)
                }}
              >
                <span className="type-mini menu-mini" data-typ={t.id} style={typy.style(t.id)}>
                  {t.short}
                </span>{' '}
                Nowy — {t.label.toLowerCase()}
              </button>
            ))}
            <button
              className="path-ctxmenu-item"
              onClick={() => {
                addHeadingAt(ctxMenu.fx, ctxMenu.fy, 1)
                setCtxMenu(null)
              }}
            >
              § Nowy rozdział tutaj
            </button>
            <button
              className="path-ctxmenu-item"
              onClick={() => {
                addHeadingAt(ctxMenu.fx, ctxMenu.fy, 2)
                setCtxMenu(null)
              }}
            >
              §§ Nowy podrozdział tutaj
            </button>
            <button
              className="path-ctxmenu-item"
              onClick={() => {
                addTextAt(ctxMenu.fx, ctxMenu.fy)
                setCtxMenu(null)
              }}
            >
              📝 Nowa notatka tutaj
            </button>
            <button
              className="path-ctxmenu-item"
              onClick={() => {
                addCommentAt(ctxMenu.fx, ctxMenu.fy)
                setCtxMenu(null)
              }}
            >
              <Icon name="komentarz" size={1} /> Nowy komentarz tutaj
            </button>
          </div>
        )}
        {nodeMenu && (
          <div
            className="path-ctxmenu"
            ref={clampMenu}
            style={{ left: nodeMenu.sx, top: nodeMenu.sy }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {nodeMenu.nodeType === 'block' && (
              <button
                className="path-ctxmenu-item"
                onClick={() => {
                  const n = rfNodes.find((x) => x.id === nodeMenu.nodeId)
                  if (n) onOpenConcept(n.data.conceptId as string)
                  setNodeMenu(null)
                }}
              >
                ✏ Edytuj kafelek
              </button>
            )}
            {(nodeMenu.nodeType === 'text' || nodeMenu.nodeType === 'comment') && (
              <button
                className="path-ctxmenu-item"
                onClick={() => {
                  setEditingNote(nodeMenu.nodeId)
                  setNodeMenu(null)
                }}
              >
                ✏ Edytuj
              </button>
            )}
            {nodeMenu.nodeType === 'fusion' && (
              <button
                className="path-ctxmenu-item"
                onClick={() => {
                  api.unfuse(nodeMenu.nodeId)
                  setNodeMenu(null)
                }}
              >
                <Icon name="rozdziel" size={1} /> Rozdziel fuzję
              </button>
            )}
            <button
              className="path-ctxmenu-item"
              onClick={() => {
                removeNode(nodeMenu.nodeId)
                setNodeMenu(null)
              }}
            >
              🗑 Usuń ze ścieżki
            </button>
          </div>
        )}
      </div>
      {komponowany &&
        (() => {
          const g = rfNodes.find((n) => n.id === komponowany)
          if (!g) return null
          const parts = (g.data.parts as FusionPart[]) ?? []
          return (
            <Komponowanie
              name={(g.data.name as string) ?? ''}
              type={(g.data.type as BlockType | undefined) ?? undefined}
              parts={parts}
              content={g.data.content as string | undefined}
              strony={(g.data.strony as StronaBloku[] | undefined) ?? []}
              zrodla={(g.data.zrodla as SourceRef[] | undefined) ?? []}
              onZmiana={(co) => api.updateData(g.id, co)}
              onClose={() => setKomponowany(null)}
            />
          )
        })()}

      {fusionTarget && (
        <ConceptPicker
          title="⧉ Dołóż kafelek do scalonego bloku"
          onPick={(c: { id: string }) => {
            setRfNodes((ns) =>
              ns.map((n) => {
                if (n.id !== fusionTarget) return n
                const parts = [
                  ...((n.data.parts as {
                    conceptId: string
                    versionId: string | null
                  }[]) ?? []),
                ]
                if (parts.some((p) => p.conceptId === c.id)) return n
                parts.push({ conceptId: c.id, versionId: null })
                return { ...n, data: { ...n.data, parts } }
              }),
            )
            setFusionTarget(null)
          }}
          onClose={() => setFusionTarget(null)}
        />
      )}

      {editingNote &&
        (() => {
          const n = rfNodes.find((x) => x.id === editingNote)
          if (!n) return null
          const isComment = n.type === 'comment'
          const text = (n.data.text as string) ?? ''
          return (
            <div className="note-modal-backdrop" onClick={() => setEditingNote(null)}>
              <div className="note-modal" onClick={(e) => e.stopPropagation()}>
                <header className="note-modal-head">
                  <h3>
                    {isComment ? '💬 Komentarz do ścieżki' : '✥ Notatka (intuicja)'}
                  </h3>
                  <div className="view-switch">
                    {(['wizualny', 'kod', 'podzial'] as const).map((m) => (
                      <button
                        key={m}
                        className={`btn ${noteView === m ? 'btn-active' : ''}`}
                        title={
                          m === 'wizualny'
                            ? 'Pisanie z wzorami renderowanymi w miejscu'
                            : m === 'kod'
                              ? 'Czysty Markdown + LaTeX'
                              : 'Kod i podgląd obok siebie'
                        }
                        onClick={() => setNoteView(m)}
                      >
                        {m === 'wizualny' ? 'Wizualny' : m === 'kod' ? 'Kod' : 'Podział'}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn btn-close"
                    title="Zamknij (Escape)"
                    onClick={() => setEditingNote(null)}
                  >
                    ✕
                  </button>
                </header>
                <div className={`note-modal-body view-${noteView}`}>
                  {noteView === 'wizualny' ? (
                    <RichEditor
                      key={n.id}
                      value={text}
                      editable
                      ruler={false}
                      autoFocus
                      onChange={(v) => api.updateData(n.id, { text: v })}
                    />
                  ) : (
                    <>
                      <div className="editor-code">
                        <CodeMirror
                          value={text}
                          onChange={(v) => api.updateData(n.id, { text: v })}
                          extensions={noteExtensions}
                          autoFocus
                          placeholder={'Markdown + LaTeX: $x^2$…'}
                          basicSetup={{
                            lineNumbers: false,
                            foldGutter: false,
                            autocompletion: false,
                          }}
                          style={{ height: '100%' }}
                        />
                      </div>
                      {noteView === 'podzial' && (
                        <div
                          className="editor-preview markdown-body"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
    </section>
  )
}

export function PathCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
