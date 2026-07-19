import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { extractLinks } from '../markdown'
import { BLOCK_TYPE_LABELS, type BlockType } from '../types'

interface GraphNode extends SimulationNodeDatum {
  id: string
  name: string
  type: BlockType
  degree: number
}

type GraphLink = SimulationLinkDatum<GraphNode>

interface Props {
  onOpen: (id: string) => void
}

const TYPE_COLORS: Record<BlockType, string> = {
  definicja: '#31619e',
  twierdzenie: '#6d4a9e',
  lemat: '#8a5fb0',
  dowod: '#6b6b66',
  przyklad: '#3d7a52',
  uwaga: '#a9742c',
  intuicja: '#b05575',
}

/** Graf powiązań: węzły = pojęcia, krawędzie = wiki-linki w bieżących wersjach. */
export function GraphView({ onOpen }: Props) {
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const versions = useLiveQuery(() => db.versions.toArray(), []) ?? []

  const containerRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const [, setTick] = useState(0)

  // pan / zoom
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const panRef = useRef<{ x0: number; y0: number; tx: number; ty: number } | null>(null)
  const dragRef = useRef<GraphNode | null>(null)

  /** Klucz danych: przelicz graf tylko, gdy zmieniła się struktura linków. */
  const dataKey = useMemo(() => {
    const byId = new Map(versions.map((v) => [v.id, v.content]))
    return JSON.stringify(
      concepts.map((c) => [c.id, c.name, c.type, extractLinks(byId.get(c.currentVersionId) ?? '')]),
    )
  }, [concepts, versions])

  useEffect(() => {
    const byId = new Map(versions.map((v) => [v.id, v.content]))
    const byName = new Map(concepts.map((c) => [c.name.toLowerCase(), c]))

    const nodes: GraphNode[] = concepts.map((c) => {
      // zachowaj pozycje istniejących węzłów (płynność przy edycji)
      const prev = nodesRef.current.find((n) => n.id === c.id)
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        degree: 0,
        x: prev?.x,
        y: prev?.y,
      }
    })
    const nodeById = new Map(nodes.map((n) => [n.id, n]))

    const links: GraphLink[] = []
    for (const c of concepts) {
      for (const name of extractLinks(byId.get(c.currentVersionId) ?? '')) {
        const target = byName.get(name.toLowerCase())
        if (target && target.id !== c.id) {
          links.push({ source: c.id, target: target.id })
          nodeById.get(c.id)!.degree++
          nodeById.get(target.id)!.degree++
        }
      }
    }

    nodesRef.current = nodes
    linksRef.current = links

    const w = containerRef.current?.clientWidth ?? 800
    const h = containerRef.current?.clientHeight ?? 600

    simRef.current?.stop()
    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(95),
      )
      .force('charge', forceManyBody().strength(-260))
      .force('center', forceCenter(w / 2, h / 2))
      .force('collide', forceCollide(34))
      .on('tick', () => setTick((t) => t + 1))
    simRef.current = sim
    return () => {
      sim.stop()
    }
  }, [dataKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------- interakcje -------

  const toLocal = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - transform.x) / transform.k,
      y: (e.clientY - rect.top - transform.y) / transform.k,
    }
  }

  const onPointerDownNode = (e: React.PointerEvent, n: GraphNode) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = n
    simRef.current?.alphaTarget(0.3).restart()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const p = toLocal(e)
      dragRef.current.fx = p.x
      dragRef.current.fy = p.y
      return
    }
    if (panRef.current) {
      setTransform((t) => ({
        ...t,
        x: panRef.current!.tx + (e.clientX - panRef.current!.x0),
        y: panRef.current!.ty + (e.clientY - panRef.current!.y0),
      }))
    }
  }

  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current.fx = null
      dragRef.current.fy = null
      dragRef.current = null
      simRef.current?.alphaTarget(0)
    }
    panRef.current = null
  }

  const onPointerDownBg = (e: React.PointerEvent) => {
    panRef.current = { x0: e.clientX, y0: e.clientY, tx: transform.x, ty: transform.y }
  }

  const onWheel = (e: React.WheelEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setTransform((t) => {
      const k = Math.min(4, Math.max(0.25, t.k * factor))
      // zoom wokół kursora
      return { k, x: mx - ((mx - t.x) / t.k) * k, y: my - ((my - t.y) / t.k) * k }
    })
  }

  const nodes = nodesRef.current
  const links = linksRef.current

  return (
    <section className="graph-view" ref={containerRef}>
      {nodes.length === 0 ? (
        <div className="graph-empty">
          <p>Brak klocków do pokazania.</p>
          <p className="hint">
            Twórz powiązania pisząc w treści <code>[[Nazwa pojęcia]]</code>.
          </p>
        </div>
      ) : (
        <svg
          className="graph-svg"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDown={onPointerDownBg}
          onWheel={onWheel}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {links.map((l, i) => {
              const s = l.source as GraphNode
              const t = l.target as GraphNode
              return (
                <line
                  key={i}
                  className="graph-link"
                  x1={s.x ?? 0}
                  y1={s.y ?? 0}
                  x2={t.x ?? 0}
                  y2={t.y ?? 0}
                />
              )
            })}
            {nodes.map((n) => (
              <g
                key={n.id}
                className="graph-node"
                transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                onPointerDown={(e) => onPointerDownNode(e, n)}
                onClick={() => onOpen(n.id)}
              >
                <circle
                  r={7 + Math.min(6, n.degree * 1.5)}
                  fill={TYPE_COLORS[n.type]}
                >
                  <title>
                    {BLOCK_TYPE_LABELS[n.type]}: {n.name}
                  </title>
                </circle>
                <text className="graph-label" y={7 + Math.min(6, n.degree * 1.5) + 13}>
                  {n.name}
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
      <div className="graph-legend">
        {(Object.keys(TYPE_COLORS) as BlockType[]).map((t) => (
          <span key={t} className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: TYPE_COLORS[t] }} />
            {BLOCK_TYPE_LABELS[t]}
          </span>
        ))}
      </div>
    </section>
  )
}
