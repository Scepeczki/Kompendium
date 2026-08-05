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
import { useBlockTypes } from '../blockTypes'
import type { BlockType } from '../types'

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

/** Graf powiązań: węzły = pojęcia, krawędzie = wiki-linki w bieżących wersjach. */
export function GraphView({ onOpen }: Props) {
  const typy = useBlockTypes()
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
  /** Naciśnięcie na węźle, zanim wiadomo, czy to klik czy przeciąganie. */
  const pressRef = useRef<{ node: GraphNode; x: number; y: number; drag: boolean } | null>(
    null,
  )
  /** Widok dopasowuje się sam raz na otwarcie grafu, nie przy każdym drgnięciu. */
  const fittedRef = useRef(false)

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

  /** Ile pikseli wolno drgnąć ręce, żeby to był jeszcze klik, a nie przeciąganie. */
  const PROG = 4

  const onPointerDownNode = (e: React.PointerEvent, n: GraphNode) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    // Samo naciśnięcie niczego nie rusza. Wcześniej budziło tu symulację,
    // przez co graf rozjeżdżał się od zwykłego kliknięcia w węzeł.
    pressRef.current = { node: n, x: e.clientX, y: e.clientY, drag: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const press = pressRef.current
    if (press) {
      if (!press.drag) {
        const dx = e.clientX - press.x
        const dy = e.clientY - press.y
        if (dx * dx + dy * dy < PROG * PROG) return
        // dopiero teraz to naprawdę przeciąganie — i dopiero teraz budzimy
        // układ, delikatnie, żeby sąsiedzi ustąpili, a nie odskoczyli
        press.drag = true
        dragRef.current = press.node
        simRef.current?.alphaTarget(0.12).restart()
      }
      const p = toLocal(e)
      press.node.fx = p.x
      press.node.fy = p.y
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
    const press = pressRef.current
    pressRef.current = null
    if (press) {
      if (press.drag) {
        press.node.fx = null
        press.node.fy = null
        dragRef.current = null
        simRef.current?.alphaTarget(0)
      } else {
        // ręka nie drgnęła — to był klik, więc otwieramy klocek
        onOpen(press.node.id)
      }
    }
    panRef.current = null
  }

  const onPointerDownBg = (e: React.PointerEvent) => {
    panRef.current = { x0: e.clientX, y0: e.clientY, tx: transform.x, ty: transform.y }
  }

  /** Ustawia widok tak, żeby cały graf mieścił się w oknie z zapasem. */
  const dopasuj = () => {
    const ns = nodesRef.current.filter((n) => n.x != null && n.y != null)
    const el = containerRef.current
    if (!ns.length || !el) return
    const xs = ns.map((n) => n.x!)
    const ys = ns.map((n) => n.y!)
    // margines na etykiety pod kółkami i oddech przy krawędziach
    const pad = 60
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad
    const w = el.clientWidth
    const h = el.clientHeight
    // nigdy nie powiększamy ponad 1: pojedynczy klocek ma zostać kropką,
    // a nie balonem na pół ekranu
    const k = Math.min(1, Math.max(0.25, Math.min(w / (maxX - minX), h / (maxY - minY))))
    setTransform({
      k,
      x: (w - (maxX - minX) * k) / 2 - minX * k,
      y: (h - (maxY - minY) * k) / 2 - minY * k,
    })
  }

  // pierwsze dopasowanie po ułożeniu się grafu — potem widok należy do
  // użytkownika i sam się już nie rusza
  useEffect(() => {
    fittedRef.current = false
  }, [dataKey])

  useEffect(() => {
    if (fittedRef.current) return
    const sim = simRef.current
    if (!sim) return
    const t = setTimeout(() => {
      if (fittedRef.current) return
      fittedRef.current = true
      dopasuj()
    }, 900)
    return () => clearTimeout(t)
  }) // bez listy zależności: czekamy na pierwszy tick z pozycjami

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
              >
                <circle
                  r={7 + Math.min(6, n.degree * 1.5)}
                  fill={typy.def(n.type).color}
                >
                  <title>
                    {typy.label(n.type)}: {n.name}
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
      {nodes.length > 0 && (
        <button className="btn graph-fit" title="Dopasuj widok do całego grafu" onClick={dopasuj}>
          Dopasuj
        </button>
      )}
      <div className="graph-legend">
        {typy.choices.map((t) => (
          <span key={t.id} className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: t.color }} />
            {t.label}
          </span>
        ))}
      </div>
    </section>
  )
}
