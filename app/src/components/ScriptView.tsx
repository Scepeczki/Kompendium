import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import {
  BLOCK_TYPE_LABELS,
  type BlockVersion,
  type Concept,
  type PathEdge,
  type PathNode,
} from '../types'

interface Props {
  pathId: string
  onClose: () => void
}

/** Porządek topologiczny wg strzałek; remisy rozstrzyga pozycja (y, potem x).
 *  Węzły w cyklu lub bez połączeń trafiają na koniec wg pozycji. */
function topoOrder(nodes: PathNode[], edges: PathEdge[]): PathNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  const posKey = (id: string) => {
    const n = byId.get(id)!
    return [n.y, n.x] as const
  }
  const ready = nodes
    .filter((n) => (indeg.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
  const result: PathNode[] = []
  const done = new Set<string>()
  while (ready.length) {
    ready.sort((a, b) => {
      const [ay, ax] = posKey(a)
      const [by, bx] = posKey(b)
      return ay - by || ax - bx
    })
    const id = ready.shift()!
    if (done.has(id)) continue
    done.add(id)
    result.push(byId.get(id)!)
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1)
      if ((indeg.get(next) ?? 0) <= 0 && !done.has(next)) ready.push(next)
    }
  }
  // cykle / reszta
  const rest = nodes.filter((n) => !done.has(n.id))
  rest.sort((a, b) => a.y - b.y || a.x - b.x)
  return [...result, ...rest]
}

/** Widok skryptu: ścieżka złożona w jeden ciągły dokument (+ druk / zapis PDF). */
export function ScriptView({ pathId, onClose }: Props) {
  const path = useLiveQuery(() => db.paths.get(pathId), [pathId])
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const versions = useLiveQuery(() => db.versions.toArray(), []) ?? []

  if (!path) return null

  const conceptById = new Map(concepts.map((c) => [c.id, c]))
  const versionById = new Map(versions.map((v) => [v.id, v]))

  const resolve = (conceptId: string, versionId: string | null) => {
    const c = conceptById.get(conceptId)
    if (!c) return null
    const v: BlockVersion | undefined = versionId
      ? versionById.get(versionId)
      : versionById.get(c.currentVersionId)
    return { concept: c, version: v }
  }

  const blockSection = (c: Concept, v: BlockVersion | undefined, key: string) => (
    <section key={key} className={`script-block script-${c.type}`}>
      <h3 className="script-block-title">
        <span className="script-block-type">{BLOCK_TYPE_LABELS[c.type]}</span> {c.name}
        {v?.label && <span className="script-block-version"> ({v.label})</span>}
      </h3>
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(v?.content ?? '') }}
      />
    </section>
  )

  const ordered = topoOrder(path.nodes, path.edges)

  return (
    <div className="script-overlay">
      <header className="script-toolbar">
        <h2 className="script-title">📜 {path.name}</h2>
        <div className="toolbar-left">
          <button className="btn btn-primary" onClick={() => window.print()}>
            🖶 Drukuj / zapisz PDF
          </button>
          <button className="btn btn-close" title="Wróć do mapy" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>
      <article className="script-body">
        <h1 className="script-heading">{path.name}</h1>
        {ordered.length === 0 && (
          <p className="hint">Ta ścieżka jest pusta — dodaj kafelki na mapie.</p>
        )}
        {ordered.map((n) => {
          if (n.kind === 'text') {
            return (
              <div
                key={n.id}
                className="script-text markdown-body"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(n.text) }}
              />
            )
          }
          if (n.kind === 'block') {
            const r = resolve(n.conceptId, n.versionId)
            if (!r) return null
            return blockSection(r.concept, r.version, n.id)
          }
          // fuzja: wspólna ramka z częściami w środku
          return (
            <section key={n.id} className="script-block script-fusion">
              <h3 className="script-block-title">
                <span className="script-block-type">Blok</span> {n.name}
              </h3>
              {n.parts.map((p, i) => {
                const r = resolve(p.conceptId, p.versionId)
                if (!r) return null
                return (
                  <div key={i} className="script-fusion-part">
                    <h4 className="script-fusion-part-title">
                      {BLOCK_TYPE_LABELS[r.concept.type]}: {r.concept.name}
                    </h4>
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(r.version?.content ?? ''),
                      }}
                    />
                  </div>
                )
              })}
            </section>
          )
        })}
      </article>
    </div>
  )
}
