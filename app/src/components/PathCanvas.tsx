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
import '@xyflow/react/dist/style.css'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { mdShortcuts, surroundSelection, wrapLines } from '../cmShortcuts'
import { wikiCompletion } from '../cmWiki'
import { RichEditor } from './RichEditor'
import { useLiveQuery } from 'dexie-react-hooks'
import { createConcept, db, updatePath } from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { ScriptBody } from './ScriptView'
import { SubpageTabs } from './SubpageTabs'
import { BlockShell } from './BlockShell'
import { GroupShell } from './GroupShell'
import { Outline, outlineId, type OutlineItem } from './Outline'
import { ConceptPicker } from './ConceptPicker'
import { GroupEditor } from './GroupEditor'
import {
  RELATION_LABELS,
  isSymmetricRelation,
  type BlockType,
  type FusionPart,
  type PathEdge,
  type PathNode,
  type SourceRef,
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
        }
      : n.kind === 'text'
        ? { text: n.text }
        : n.kind === 'comment'
          ? { text: n.text, side: n.side }
          : n.kind === 'heading'
            ? { text: n.text, level: n.level }
            : { name: n.name, parts: n.parts, type: n.type, content: n.content },
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
    }
  }
  return {
    ...base,
    kind: 'fusion',
    name: (n.data.name as string) ?? '',
    type: (n.data.type as BlockType | undefined) ?? undefined,
    parts: (n.data.parts as FusionPart[]) ?? [],
    content: (n.data.content as string | undefined) ?? undefined,
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
      () => db.subpages.where('conceptId').equals(conceptId).toArray(),
      [conceptId],
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
          title="Otwórz klocek w edytorze"
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
 *  jak w klocku (Markdown+LaTeX); edycja przez podwójny klik / menu. */
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
  onAddNote: (kind: 'text' | 'comment', afterId: string | null, beforeId: string | null) => void
  onRemove: (id: string) => void
  onEdit: (n: PathNode) => void
  onUnfuse: (id: string) => void
  onToggleSide: (id: string) => void
  onSetSubpage: (segId: string, subpageId: string | null) => void
  onSetVersion: (segId: string, versionId: string | null) => void
  /** Wersja pojedynczego klocka w grupie. */
  onSetPartVersion: (segId: string, index: number, versionId: string | null) => void
  /** Strona pojedynczego klocka w grupie. */
  onSetPartSubpage: (segId: string, index: number, subpageId: string | null) => void
  onAddHeading: (level: 1 | 2 | 3, afterId: string | null, beforeId: string | null) => void
  /** Scala segment z następnym (albo dokłada następny do grupy). */
  onGroupWithNext: (segId: string) => void
  onJumpToSource?: (ref: SourceRef) => void
  onOpenConcept?: (id: string) => void
}

function LinearView({
  ordered,
  onDropConcept,
  onMoveSegment,
  onAddNote,
  onRemove,
  onEdit,
  onUnfuse,
  onToggleSide,
  onSetSubpage,
  onSetVersion,
  onSetPartVersion,
  onSetPartSubpage,
  onAddHeading,
  onGroupWithNext,
  onJumpToSource,
  onOpenConcept,
}: LinearViewProps) {
  const [hint, setHint] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const [endHint, setEndHint] = useState(false)
  /** Menu wstawiania spod prawego przycisku — wraz z miejscem w łańcuchu. */
  const [segMenu, setSegMenu] = useState<{
    x: number
    y: number
    index: number
    pos: 'before' | 'after'
  } | null>(null)

  useEffect(() => {
    if (!segMenu) return
    const zamknij = () => setSegMenu(null)
    const klawisz = (e: KeyboardEvent) => e.key === 'Escape' && setSegMenu(null)
    document.addEventListener('mousedown', zamknij)
    document.addEventListener('scroll', zamknij, true)
    window.addEventListener('keydown', klawisz)
    return () => {
      document.removeEventListener('mousedown', zamknij)
      document.removeEventListener('scroll', zamknij, true)
      window.removeEventListener('keydown', klawisz)
    }
  }, [segMenu])
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const versions = useLiveQuery(() => db.versions.toArray(), []) ?? []

  const conceptById = (id: string) => concepts.find((c) => c.id === id)

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
    setHint(null)
    setEndHint(false)
    const seg = e.dataTransfer.getData(SEG_MIME)
    if (seg) {
      onMoveSegment(seg, afterId, beforeId)
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

  const segmentContent = (n: PathNode) => {
    if (n.kind === 'block') {
      const c = conceptById(n.conceptId)
      if (!c) return <div className="script-block">(usunięte pojęcie)</div>
      return (
        <BlockShell
          concept={c}
          versions={versions.filter((v) => v.conceptId === c.id)}
          versionId={n.versionId}
          onVersionChange={(id: string | null) => onSetVersion(n.id, id)}
          subpageId={n.subpageId ?? null}
          onSubpageChange={(id: string | null) => onSetSubpage(n.id, id)}
          onOpenConcept={onOpenConcept}
          onJumpToSource={onJumpToSource}
          showOpen={false}
          pickHint="Ustawienie tej ścieżki — tak będzie pokazywane przy czytaniu"
        />
      )
    }
    if (n.kind === 'heading') {
      const H = (`h${n.level + 1}` as unknown) as 'h2'
      return (
        <H
          id={outlineId(n.id)}
          className={`script-heading-node level-${n.level}`}
          onDoubleClick={() => onEdit(n)}
        >
          {n.text || '(rozdział bez nazwy)'}
        </H>
      )
    }
    if (n.kind === 'text') {
      return (
        <div
          className="script-text markdown-body linear-note"
          dangerouslySetInnerHTML={{
            __html: n.text
              ? renderMarkdown(n.text)
              : '<p class="note-empty">pusta notatka — ✏ aby edytować</p>',
          }}
        />
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
              <button className="folder-action" title="Edytuj" onClick={() => onEdit(n)}>
                ✏
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
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{
              __html: n.text
                ? renderMarkdown(n.text)
                : '<p class="note-empty">pusty komentarz — ✏ aby edytować</p>',
            }}
          />
        </aside>
      )
    }
    // grupa czyta się jak jeden blok danego typu
    return (
      <GroupShell
        name={n.name}
        type={n.type}
        parts={n.parts}
        content={n.content}
        onVersionChange={(i, id) => onSetPartVersion(n.id, i, id)}
        onSubpageChange={(i, id) => onSetPartSubpage(n.id, i, id)}
        onJumpToSource={onJumpToSource}
        pickHint="Ustawienie tej ścieżki — tak będzie pokazywane przy czytaniu"
      />
    )
  }

  const last = ordered[ordered.length - 1] ?? null
  const outline: OutlineItem[] = ordered
    .filter((n) => n.kind === 'heading')
    .map((n) => ({ domId: outlineId(n.id), text: n.text, level: n.level }))

  return (
    <div className="linear-view">
      <Outline items={outline} />
      <div className="linear-column">
        {ordered.map((n, i) => {
          const h = hint?.id === n.id ? hint.pos : null
          return (
            <div
              key={n.id}
              className={`linear-seg ${n.kind === 'comment' ? 'linear-seg-sidenote' : ''} ${
                h === 'before' ? 'drop-before' : h === 'after' ? 'drop-after' : ''
              }`}
              onDragOver={(e) => {
                if (!isOurs(e)) return
                e.preventDefault()
                e.stopPropagation()
                const r = e.currentTarget.getBoundingClientRect()
                const pos = e.clientY - r.top < r.height / 2 ? 'before' : 'after'
                setHint({ id: n.id, pos })
                setEndHint(false)
              }}
              onDragLeave={() => setHint(null)}
              onDrop={(e) => {
                const pos = hint?.id === n.id ? hint.pos : 'after'
                const { afterId, beforeId } = neighbors(i, pos)
                handleDrop(e, afterId, beforeId)
              }}
              onContextMenu={(e) => {
                // wstawianie tam, gdzie stoi kursor: górna połowa segmentu
                // znaczy „przed nim", dolna „za nim". Bez tego rozdział na
                // początku skryptu trzeba było dodać na końcu i przeciągać.
                if ((e.target as Element).closest('.linear-menu')) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const pos = e.clientY - r.top < r.height / 2 ? 'before' : 'after'
                setSegMenu({ x: e.clientX, y: e.clientY, index: i, pos })
              }}
            >
              {n.kind !== 'comment' && (
              <div className="linear-side">
                <button
                  draggable
                  className="linear-grip"
                  title="Przeciągnij, aby zmienić kolejność"
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SEG_MIME, n.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  ⣿
                </button>
                <button className="folder-action" title="Edytuj" onClick={() => onEdit(n)}>
                  ✏
                </button>
                {(n.kind === 'block' || n.kind === 'fusion') &&
                  (() => {
                    const next = ordered[i + 1]
                    if (!next || (next.kind !== 'block' && next.kind !== 'fusion')) {
                      return null
                    }
                    return (
                      <button
                        className="folder-action"
                        title={
                          n.kind === 'fusion'
                            ? 'Dołącz następny klocek do tej grupy'
                            : 'Scal z następnym klockiem w jedną grupę'
                        }
                        onClick={() => onGroupWithNext(n.id)}
                      >
                        ⧉
                      </button>
                    )
                  })()}
                {n.kind === 'fusion' && (
                  <button
                    className="folder-action"
                    title="Rozdziel fuzję"
                    onClick={() => onUnfuse(n.id)}
                  >
                    ⇱
                  </button>
                )}
                <button
                  className="folder-action"
                  title="Usuń ze ścieżki"
                  onClick={() => onRemove(n.id)}
                >
                  ×
                </button>
              </div>
              )}
              <div className="linear-content">{segmentContent(n)}</div>
            </div>
          )
        })}
        <div
          className={`linear-append ${endHint ? 'drop-into' : ''}`}
          onDragOver={(e) => {
            if (!isOurs(e)) return
            e.preventDefault()
            setEndHint(true)
            setHint(null)
          }}
          onDragLeave={() => setEndHint(false)}
          onDrop={(e) => handleDrop(e, last?.id ?? null, null)}
        >
          <p>Przeciągnij klocek z listy po lewej, aby dokleić go do skryptu…</p>
          <div className="linear-append-actions">
            <button
              className="btn"
              title="Rozdział — dzieli skrypt na części"
              onClick={() => onAddHeading(1, last?.id ?? null, null)}
            >
              + § Rozdział
            </button>
            <button
              className="btn"
              title="Podrozdział"
              onClick={() => onAddHeading(2, last?.id ?? null, null)}
            >
              + §§ Podrozdział
            </button>
            <button className="btn" onClick={() => onAddNote('text', last?.id ?? null, null)}>
              + Notatka
            </button>
            <button
              className="btn"
              onClick={() => onAddNote('comment', last?.id ?? null, null)}
            >
              + 💬 Komentarz
            </button>
          </div>
        </div>
      </div>

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
                  ? (conceptById(n.conceptId)?.name ?? 'klocek')
                  : n.kind === 'fusion'
                    ? n.name
                    : n.kind === 'comment'
                      ? 'komentarzem'
                      : 'notatką'
          const wstaw = (fn: () => void) => () => {
            setSegMenu(null)
            fn()
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
              <div className="tree-menu-where">
                {segMenu.pos === 'before' ? 'przed' : 'po'} „{opis(sasiad)}"
              </div>
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddHeading(1, afterId, beforeId))}
              >
                § Rozdział
              </button>
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddHeading(2, afterId, beforeId))}
              >
                §§ Podrozdział
              </button>
              <div className="tree-menu-sep" />
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddNote('text', afterId, beforeId))}
              >
                ✎ Notatka
              </button>
              <button
                className="tree-menu-item"
                onClick={wstaw(() => onAddNote('comment', afterId, beforeId))}
              >
                💬 Komentarz
              </button>
            </div>
          )
        })()}
    </div>
  )
}

/** Pojedynczy klocek w grupie — z własnym wyborem wersji i treścią. */
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
  if (!concept) return <div className="group-member">(usunięty klocek)</div>
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
          title="Wyjmij ten klocek z grupy"
          onClick={() => ctx.removeFusionPart(groupId, index)}
        >
          ×
        </button>
      </div>
      <NodeBody html={renderMarkdown(version?.content ?? '')} />
    </div>
  )
}

/** Grupa: kilka klocków pokazanych razem pod wspólną nazwą nadaną w tej
 *  ścieżce. W bazie to nadal osobne klocki — grupa jest tylko formą pokazania. */
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
          title="Dodaj klocek do grupy"
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
}

function CanvasInner({ pathId, onClose, onOpenConcept, onJumpToSource }: Props) {
  const dlg = useDialogs()
  // przez pudełko, żeby `api` mapy zachowało stałą tożsamość (od niej zależy
  // płynność przeciągania kafelków — patrz komentarz przy useMemo niżej)
  const dlgRef = useRef(dlg)
  dlgRef.current = dlg
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

  // pokazywanie powiązań między klockami (relacje z warstwy wiedzy)
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
  /** Fuzja, do której dokładamy klocek (otwiera okno wyboru). */
  const [fusionTarget, setFusionTarget] = useState<string | null>(null)
  /** Edytowana grupa (nazwa + czym ma być). */
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  // tryb pisania w oknie notatki — jak w edytorze klocka
  const [noteView, setNoteView] = useState<'wizualny' | 'kod' | 'podzial'>(() => {
    const v = localStorage.getItem('ui.noteView')
    return v === 'kod' || v === 'podzial' ? v : 'wizualny'
  })
  useEffect(() => {
    localStorage.setItem('ui.noteView', noteView)
  }, [noteView])

  // nazwy pojęć do podpowiedzi wiki-linków w notatkach
  const allConcepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const allVersions = useLiveQuery(() => db.versions.toArray(), []) ?? []
  const allSubpages = useLiveQuery(() => db.subpages.toArray(), []) ?? []
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
  const [mode, setMode] = useState<'map' | 'linear' | 'script'>(() => {
    const m = localStorage.getItem('ui.pathMode')
    return m === 'linear' || m === 'script' ? m : 'map'
  })
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
      // przepisana treść całości ginie przy rozdzieleniu — o to trzeba zapytać
      if (typeof f.data.content === 'string') {
        const ok = await dlgRef.current.confirm({
          title: `Rozdzielić „${(f.data.name as string) ?? 'grupę'}"?`,
          message:
            'Ta grupa ma własną, przepisaną treść — przy rozdzieleniu przepadnie ' +
            'i wrócą osobne klocki z ich własnymi tekstami. Same klocki są nietknięte.',
          confirmLabel: 'Rozdziel i porzuć tekst',
          danger: true,
        })
        if (!ok) return
      }
      const parts = (f.data.parts as FusionPart[]) ?? []
      const blocks: Node[] = parts.map((p, i) => ({
        id: crypto.randomUUID(),
        type: 'block',
        position: { x: f.position.x + i * 30, y: f.position.y + i * 220 },
        data: { conceptId: p.conceptId, versionId: p.versionId, subpageId: p.subpageId ?? null },
      }))
      setRfNodes((ns) => [...ns.filter((n) => n.id !== id), ...blocks])
      // Łańcuch trzeba zszyć: poprzednik → uwolnione po kolei → następnik.
      // Bez tego uwolnione klocki zostawały bez strzałek i wypadały z kolejności.
      setRfEdges((es) => {
        const przed = es.filter((e) => e.target === id).map((e) => e.source)
        const po = es.filter((e) => e.source === id).map((e) => e.target)
        const rest = es.filter((e) => e.source !== id && e.target !== id)
        const dodane: Edge[] = []
        for (const p of przed) dodane.push(mkEdge(p, blocks[0].id))
        for (let i = 0; i < blocks.length - 1; i++) {
          dodane.push(mkEdge(blocks[i].id, blocks[i + 1].id))
        }
        for (const n of po) dodane.push(mkEdge(blocks[blocks.length - 1].id, n))
        return [...rest, ...dodane]
      })
    },
    renameFusion: (id) => setEditingGroup(id),
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

  /** Części klocka albo grupy — do składania grup z jednego i drugiego. */
  const partsOf = (n: Node): { conceptId: string; versionId: string | null }[] =>
    n.type === 'fusion'
      ? ((n.data.parts as { conceptId: string; versionId: string | null }[]) ?? [])
      : n.type === 'block'
        ? [
            {
              conceptId: n.data.conceptId as string,
              versionId: (n.data.versionId as string | null) ?? null,
            },
          ]
        : []

  /** Scala wskazane kafelki (klocki i istniejące grupy) w jedną grupę,
   *  zachowując podaną kolejność. Klocki w bazie zostają nietknięte. */
  const groupNodes = async (orderedIds: string[]) => {
    const chosen = orderedIds
      .map((id) => rfNodes.find((n) => n.id === id))
      .filter((n): n is Node => !!n && (n.type === 'block' || n.type === 'fusion'))
    if (chosen.length < 2) return

    // dołączanie do istniejącej grupy zachowuje jej nazwę i typ
    const existing = chosen.find((n) => n.type === 'fusion')
    const name = existing
      ? (existing.data.name as string)
      : await dlg.prompt({
          title: 'Nazwa grupy',
          message:
            'Grupa istnieje tylko w tej ścieżce — klocki zostają osobnymi klockami.',
          placeholder: 'np. Kresy zbiorów',
          confirmLabel: 'Scal',
        })
    if (!name) return

    const parts: { conceptId: string; versionId: string | null }[] = []
    for (const n of chosen) {
      for (const p of partsOf(n)) {
        if (!parts.some((x) => x.conceptId === p.conceptId)) parts.push(p)
      }
    }

    // typ całości: z grupy, a przy nowej — gdy wszystkie klocki są jednakowe
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
      data: { name, type, parts },
    }

    // Miejsce grupy w łańcuchu: tam, gdzie stał najwcześniejszy z jej członków.
    // Potrzebne, bo scalać wolno kafelki NIE po kolei — a wtedy zwykłe
    // przepięcie strzałek na grupę robi z sąsiada pętlę (G → Gamma → G)
    // i cały dalszy ciąg ścieżki wypada z porządku.
    const kolejnosc = topoOrder(rfNodes.map(fromRfNode), rfEdges.map(fromRfEdge))
    const miejsce = new Map(kolejnosc.map((n, i) => [n.id, i]))
    const gPos = Math.min(...chosen.map((n) => miejsce.get(n.id) ?? 0))

    setRfNodes((ns) => [...ns.filter((n) => !gone.has(n.id)), group])
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

  /** Usuwa kafelek ze ścieżki (klocek zostaje w bazie) wraz z jego strzałkami. */
  const removeNode = (id: string) => {
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
    setEditingNote(id)
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
      setEditingGroup(node.id)
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
    (chs: NodeChange[]) => setRfNodes((ns) => applyNodeChanges(chs, ns)),
    [],
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
    // kafelki (także klocki schowane w grupie) wskazujące na dane pojęcie
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

  return (
    <section className="path-canvas">
      <header className="path-toolbar">
        <input
          className="input path-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            updatePath(pathId, { name: e.target.value })
          }}
          placeholder="Nazwa ścieżki…"
        />
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
        <button className="btn btn-close" title="Zamknij ścieżkę" onClick={onClose}>
          ✕
        </button>
      </header>
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
            + 💬 Komentarz
          </button>
          <button
            className="btn"
            onClick={() => handleAddHeading(1)}
            title="Dodaj rozdział (dwuklik na kafelku zmienia nazwę, § zmienia poziom)"
          >
            + § Rozdział
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
            title="Pokaż powiązania między klockami (zawieranie, skala, perspektywa) jako przerywane strzałki"
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
            title="Scal zaznaczone klocki w jeden bloczek (w tej ścieżce)"
          >
            ⧉ Scal ({selectedBlocks})
          </button>
        </div>
      )}
      <div className="path-hint">
        {mode === 'map'
          ? 'Przeciągnij klocki z listy po lewej · łącz strzałkami (od dolnej kropki do górnej) · prawy przycisk = nowy klocek/notatka/komentarz · Ctrl+klik zaznacza wiele · Shift = przyciąganie do siatki · Delete usuwa'
          : mode === 'linear'
            ? 'Doklejaj segmenty jeden pod drugim: przeciągaj klocki z listy po lewej (także między segmenty), zmieniaj kolejność uchwytem ⣿, scalaj sąsiednie klocki w grupę przyciskiem ⧉, dodawaj notatki i komentarze'
            : 'Gotowy skrypt ścieżki (tylko odczyt) — edytuj na Mapie albo w Linii'}
      </div>
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
          onDropConcept={linearDropConcept}
          onMoveSegment={moveSegment}
          onAddNote={linearAddNote}
          onRemove={removeSegmentHeal}
          onEdit={async (n) => {
            if (n.kind === 'block') onOpenConcept(n.conceptId)
            else if (n.kind === 'text' || n.kind === 'comment') setEditingNote(n.id)
            else if (n.kind === 'fusion') setEditingGroup(n.id)
            else if (n.kind === 'heading') {
              const text = await dlg.prompt({ title: 'Nazwa rozdziału', value: n.text })
              if (text) api.updateData(n.id, { text })
            }
          }}
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
              🧱 Nowy klocek tutaj
            </button>
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
              💬 Nowy komentarz tutaj
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
                ✏ Edytuj klocek
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
                ⇱ Rozdziel fuzję
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
      {editingGroup &&
        (() => {
          const g = rfNodes.find((n) => n.id === editingGroup)
          if (!g) return null
          const czesci = (g.data.parts as FusionPart[]) ?? []
          // punkt wyjścia do przepisania: treści składników jedna pod drugą
          const sklejone = czesci
            .map((p) => {
              const c = allConcepts.find((x) => x.id === p.conceptId)
              const v =
                allVersions.find((x) => x.id === p.versionId) ??
                allVersions.find((x) => x.id === c?.currentVersionId)
              const s = allSubpages.find((x) => x.id === p.subpageId)
              return (s ? s.content : (v?.content ?? '')).trim()
            })
            .filter(Boolean)
            .join('\n\n')
          return (
            <GroupEditor
              name={(g.data.name as string) ?? ''}
              type={(g.data.type as BlockType | undefined) ?? undefined}
              content={(g.data.content as string | undefined) ?? undefined}
              sklejone={sklejone}
              onChangeName={(name) => api.updateData(g.id, { name })}
              onChangeType={(type) => api.updateData(g.id, { type })}
              onChangeContent={(content) => api.updateData(g.id, { content })}
              onClose={() => setEditingGroup(null)}
            />
          )
        })()}

      {fusionTarget && (
        <ConceptPicker
          title="⧉ Dołóż klocek do scalonego bloku"
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
