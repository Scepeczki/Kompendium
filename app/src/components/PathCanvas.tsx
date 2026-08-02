import {
  createContext,
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
import { mdShortcuts, wrapLines } from '../cmShortcuts'
import { wikiCompletion } from '../cmWiki'
import { RichEditor } from './RichEditor'
import { useLiveQuery } from 'dexie-react-hooks'
import { createConcept, db, updatePath } from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { ScriptBody } from './ScriptView'
import { SubpageTabs } from './SubpageTabs'
import { BlockShell } from './BlockShell'
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_SHORT,
  type PathEdge,
  type PathNode,
  type SourceRef,
} from '../types'

const MIME = 'text/x-kompendium'
/** Przeciąganie segmentów w trybie liniowym. */
const SEG_MIME = 'text/x-komp-seg'

interface CanvasApi {
  updateData: (id: string, patch: Record<string, unknown>) => void
  unfuse: (id: string) => void
  openConcept: (id: string) => void
  /** Numer i liczba strzałek wychodzących z tego samego źródła. */
  edgeOrderInfo: (edgeId: string, source: string) => { index: number; count: number }
  /** Przestawia strzałkę o jedną pozycję wcześniej (z zawinięciem na koniec). */
  cycleEdgePriority: (edgeId: string) => void
}

const CanvasCtx = createContext<CanvasApi>(null!)

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
            : { name: n.name, parts: n.parts },
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
    parts: (n.data.parts as { conceptId: string; versionId: string | null }[]) ?? [],
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

function BlockNode({ id, data, selected }: NodeProps) {
  const ctx = useContext(CanvasCtx)
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
        <span className={`type-mini type-${concept.type}`} title={BLOCK_TYPE_LABELS[concept.type]}>
          {BLOCK_TYPE_SHORT[concept.type]}
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
      <div
        className="path-node-body markdown-body"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown(activeSub ? activeSub.content : (version?.content ?? '')),
        }}
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
      <div
        className="path-node-notebody markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
  onAddHeading: (level: 1 | 2 | 3, afterId: string | null, beforeId: string | null) => void
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
  onAddHeading,
  onJumpToSource,
  onOpenConcept,
}: LinearViewProps) {
  const [hint, setHint] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const [endHint, setEndHint] = useState(false)
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
          pickHint="Ustawienie tej ścieżki — tak będzie pokazywane przy czytaniu"
        />
      )
    }
    if (n.kind === 'heading') {
      const H = (`h${n.level + 1}` as unknown) as 'h2'
      return (
        <H className={`script-heading-node level-${n.level}`} onDoubleClick={() => onEdit(n)}>
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
    return (
      <section className="script-block script-fusion">
        <header className="script-block-head">
          <h3 className="script-block-title">
            <span className="script-block-type">Blok:</span> {n.name}
          </h3>
        </header>
        <div className="script-block-body">
          <ul className="fusion-parts">
            {n.parts.map((p, i) => (
              <li key={i}>{conceptById(p.conceptId)?.name ?? '(usunięte)'}</li>
            ))}
          </ul>
        </div>
      </section>
    )
  }

  const last = ordered[ordered.length - 1] ?? null

  return (
    <div className="linear-view">
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
    </div>
  )
}

function FusionNode({ id, data, selected }: NodeProps) {
  const ctx = useContext(CanvasCtx)
  const parts = (data.parts as { conceptId: string }[]) ?? []
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const nameOf = (cid: string) => concepts.find((c) => c.id === cid)?.name ?? '(usunięte)'
  return (
    <div className={`path-node path-node-fusion ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <header className="path-node-head">
        <span className="fusion-badge">FUZJA</span>
        <span className="path-node-name">{data.name as string}</span>
        <button
          className="path-node-open nodrag"
          title="Rozdziel z powrotem na osobne klocki"
          onClick={() => ctx.unfuse(id)}
        >
          ⇱
        </button>
      </header>
      <ul className="fusion-parts">
        {parts.map((p, i) => (
          <li key={i}>{nameOf(p.conceptId)}</li>
        ))}
      </ul>
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

const nodeTypes = {
  block: BlockNode,
  text: TextNode,
  comment: CommentNode,
  fusion: FusionNode,
  heading: HeadingNode,
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
  const [name, setName] = useState('')
  const [rfNodes, setRfNodes] = useState<Node[]>([])
  const [rfEdges, setRfEdges] = useState<Edge[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const loadedRef = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const { screenToFlowPosition } = useReactFlow()
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
  const conceptNamesRef = useRef<string[]>([])
  conceptNamesRef.current = allConcepts.map((c) => c.name)
  const noteExtensions = useMemo(
    () => [
      markdown(),
      mdShortcuts,
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

  /** Strzałki z tego samego źródła w efektywnej kolejności:
   *  jawny priorytet, a bez niego pozycja celu na mapie (y, potem x). */
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

  const api: CanvasApi = {
    updateData: (id, patch) =>
      setRfNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      ),
    edgeOrderInfo: (edgeId, source) => {
      const sibs = siblingsSorted(source, rfEdges, rfNodes)
      return { index: sibs.findIndex((e) => e.id === edgeId) + 1, count: sibs.length }
    },
    cycleEdgePriority: (edgeId) =>
      setRfEdges((es) => {
        const edge = es.find((e) => e.id === edgeId)
        if (!edge) return es
        const sibs = siblingsSorted(edge.source, es, rfNodes)
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
    unfuse: (id) =>
      setRfNodes((ns) => {
        const f = ns.find((n) => n.id === id)
        if (!f) return ns
        const parts =
          (f.data.parts as { conceptId: string; versionId: string | null }[]) ?? []
        const blocks: Node[] = parts.map((p, i) => ({
          id: crypto.randomUUID(),
          type: 'block',
          position: { x: f.position.x + i * 30, y: f.position.y + i * 60 },
          data: { conceptId: p.conceptId, versionId: p.versionId },
        }))
        setRfEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
        return [...ns.filter((n) => n.id !== id), ...blocks]
      }),
    openConcept: onOpenConcept,
  }

  const handleFuse = () => {
    const sel = rfNodes.filter((n) => selected.includes(n.id) && n.type === 'block')
    if (sel.length < 2) return
    const nm = window.prompt('Nazwa scalonego bloku (np. „Przestrzeń metryczna"):')
    if (!nm?.trim()) return
    const fid = crypto.randomUUID()
    const cx = sel.reduce((s, n) => s + n.position.x, 0) / sel.length
    const cy = sel.reduce((s, n) => s + n.position.y, 0) / sel.length
    const selIds = new Set(sel.map((n) => n.id))
    const fusion: Node = {
      id: fid,
      type: 'fusion',
      position: { x: cx, y: cy },
      data: {
        name: nm.trim(),
        parts: sel.map((n) => ({
          conceptId: n.data.conceptId as string,
          versionId: (n.data.versionId as string | null) ?? null,
        })),
      },
    }
    setRfNodes((ns) => [...ns.filter((n) => !selIds.has(n.id)), fusion])
    setRfEdges((es) => {
      const rewired = es
        .map((e) => ({
          ...e,
          source: selIds.has(e.source) ? fid : e.source,
          target: selIds.has(e.target) ? fid : e.target,
        }))
        .filter((e) => e.source !== e.target)
      // usuń duplikaty po przepięciu
      const seen = new Set<string>()
      return rewired.filter((e) => {
        const k = `${e.source}->${e.target}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    })
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
  const addHeadingAt = (fx: number, fy: number, level: 1 | 2 | 3 = 1) => {
    const label = level === 1 ? 'rozdziału' : level === 2 ? 'podrozdziału' : 'sekcji'
    const text = window.prompt(`Nazwa ${label}:`)
    if (!text?.trim()) return
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

  /** Pozycja na mapie dla segmentu wstawianego między sąsiadów. */
  const positionBetween = (afterId: string | null, beforeId: string | null) => {
    const posOf = (id: string | null) =>
      id ? rfNodes.find((n) => n.id === id)?.position : undefined
    const a = posOf(afterId)
    const b = posOf(beforeId)
    if (a && b) return { x: a.x, y: (a.y + b.y) / 2 }
    if (a) return { x: a.x, y: a.y + 240 }
    if (b) return { x: b.x, y: b.y - 240 }
    return { x: 120, y: 80 }
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
  const linearAddHeading = (
    level: 1 | 2 | 3,
    afterId: string | null,
    beforeId: string | null,
  ) => {
    const label = level === 1 ? 'rozdziału' : level === 2 ? 'podrozdziału' : 'sekcji'
    const text = window.prompt(`Nazwa ${label}:`)
    if (!text?.trim()) return
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

  const handleNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    if (node.type === 'block') {
      onOpenConcept(node.data.conceptId as string)
    } else if (node.type === 'text' || node.type === 'comment') {
      setEditingNote(node.id)
    } else if (node.type === 'heading') {
      const text = window.prompt('Nazwa rozdziału:', (node.data.text as string) ?? '')
      if (text?.trim()) api.updateData(node.id, { text: text.trim() })
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
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
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
    (chs: EdgeChange[]) => setRfEdges((es) => applyEdgeChanges(chs, es)),
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
            🗺 Mapa
          </button>
          <button
            className={`btn ${mode === 'linear' ? 'btn-active' : ''}`}
            title="Linia: doklejanie segmentów skryptu jeden pod drugim"
            onClick={() => setMode('linear')}
          >
            ≡ Linia
          </button>
          <button
            className={`btn ${mode === 'script' ? 'btn-active' : ''}`}
            title="Skrypt: gotowy ciągły dokument (tylko odczyt)"
            onClick={() => setMode('script')}
          >
            📜 Skrypt
          </button>
        </div>
        {mode === 'script' && (
          <button
            className="btn btn-primary"
            onClick={() => window.print()}
            title="Wydrukuj skrypt albo zapisz go jako PDF"
          >
            🖶 Drukuj / PDF
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
            ? 'Doklejaj segmenty jeden pod drugim: przeciągaj klocki z listy po lewej (także między segmenty), zmieniaj kolejność uchwytem ⣿, dodawaj notatki i komentarze'
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
          onEdit={(n) => {
            if (n.kind === 'block') onOpenConcept(n.conceptId)
            else if (n.kind === 'text' || n.kind === 'comment') setEditingNote(n.id)
            else if (n.kind === 'heading') {
              const text = window.prompt('Nazwa rozdziału:', n.text)
              if (text?.trim()) api.updateData(n.id, { text: text.trim() })
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
          onAddHeading={linearAddHeading}
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
            edges={rfEdges}
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
