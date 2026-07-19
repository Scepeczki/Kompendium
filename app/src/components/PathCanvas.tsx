import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { useLiveQuery } from 'dexie-react-hooks'
import { createConcept, db, updatePath } from '../db'
import { renderMarkdown } from '../markdown'
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_SHORT,
  type PathEdge,
  type PathNode,
} from '../types'

const MIME = 'text/x-kompendium'

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
      ? { conceptId: n.conceptId, versionId: n.versionId }
      : n.kind === 'text' || n.kind === 'comment'
        ? { text: n.text }
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
    }
  }
  if (n.type === 'text') {
    return { ...base, kind: 'text', text: (n.data.text as string) ?? '' }
  }
  if (n.type === 'comment') {
    return { ...base, kind: 'comment', text: (n.data.text as string) ?? '' }
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
  const concept = useLiveQuery(() => db.concepts.get(conceptId), [conceptId])
  const versions =
    useLiveQuery(
      () => db.versions.where('conceptId').equals(conceptId).toArray(),
      [conceptId],
    ) ?? []
  const version = versionId
    ? versions.find((v) => v.id === versionId)
    : versions.find((v) => v.id === concept?.currentVersionId)

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
              v{v.version}
              {v.label ? ` · ${v.label}` : ''}
            </option>
          ))}
      </select>
      <div
        className="path-node-body markdown-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(version?.content ?? '') }}
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

const nodeTypes = {
  block: BlockNode,
  text: TextNode,
  comment: CommentNode,
  fusion: FusionNode,
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

interface Props {
  pathId: string
  onClose: () => void
  onOpenScript: () => void
  onOpenConcept: (id: string) => void
}

function CanvasInner({ pathId, onClose, onOpenScript, onOpenConcept }: Props) {
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
        <button className="btn" onClick={handleAddText} title="Dodaj notatkę (tkankę łączną / intuicję)">
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
          + 💬
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
        <button className="btn btn-primary" onClick={onOpenScript} title="Złóż ścieżkę w jeden ciągły skrypt">
          📜 Skrypt
        </button>
        <button className="btn btn-close" title="Zamknij ścieżkę" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="path-hint">
        Przeciągnij klocki z listy po lewej · łącz strzałkami (od dolnej kropki do
        górnej) · prawy przycisk na tle = nowy klocek/tekst · Ctrl+klik zaznacza wiele
        · Shift przy przesuwaniu = przyciąganie do siatki · Delete usuwa
      </div>
      <div className="path-flow" ref={wrapRef} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
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
                    <button
                      className="btn btn-close"
                      title="Zamknij"
                      onClick={() => setEditingNote(null)}
                    >
                      ✕
                    </button>
                  </header>
                  <div className="note-modal-body">
                    <div className="editor-code">
                      <CodeMirror
                        value={text}
                        onChange={(v) => api.updateData(n.id, { text: v })}
                        extensions={[markdown()]}
                        placeholder={'Markdown + LaTeX: $x^2$…'}
                        basicSetup={{ lineNumbers: false, foldGutter: false }}
                        style={{ height: '100%' }}
                      />
                    </div>
                    <div
                      className="editor-preview markdown-body"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
                    />
                  </div>
                </div>
              </div>
            )
          })()}
      </div>
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
