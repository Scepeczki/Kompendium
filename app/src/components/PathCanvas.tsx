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
  Controls,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, updatePath } from '../db'
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
      : n.kind === 'text'
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
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
})

const fromRfEdge = (e: Edge): PathEdge => ({ id: e.id, from: e.source, to: e.target })

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

function TextNode({ id, data, selected }: NodeProps) {
  const ctx = useContext(CanvasCtx)
  return (
    <div className={`path-node path-node-text ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <textarea
        className="nodrag"
        value={(data.text as string) ?? ''}
        placeholder="Tkanka łączna — intuicja, komentarz, przejście…"
        onChange={(e) => ctx.updateData(id, { text: e.target.value })}
      />
      <Handle type="source" position={Position.Bottom} />
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

const nodeTypes = { block: BlockNode, text: TextNode, fusion: FusionNode }

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

  const api: CanvasApi = {
    updateData: (id, patch) =>
      setRfNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      ),
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

  const handleAddText = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    const pos = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2,
    })
    setRfNodes((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'text',
        position: pos,
        data: { text: '' },
      },
    ])
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
          { ...c, markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } },
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
        <button className="btn" onClick={handleAddText} title="Dodaj luźny tekst (tkankę łączną)">
          + Tekst
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
        górnej) · Ctrl+klik zaznacza wiele · Delete usuwa zaznaczone
      </div>
      <div className="path-flow" ref={wrapRef} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        <CanvasCtx.Provider value={api}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            deleteKeyCode={['Delete', 'Backspace']}
            connectionRadius={60}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </CanvasCtx.Provider>
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
