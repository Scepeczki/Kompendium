import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import {
  BLOCK_TYPE_LABELS,
  type BlockVersion,
  type Concept,
} from '../types'

interface Props {
  pathId: string
}

/** Treść skryptu: ścieżka złożona w jeden ciągły dokument.
 *  Osadzana jako trzeci tryb widoku ścieżki (obok Mapy i Linii). */
export function ScriptBody({ pathId }: Props) {
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
    <div className="script-embed">
      <article className="script-body">
        <h1 className="script-heading">{path.name}</h1>
        {ordered.length === 0 && (
          <p className="hint">Ta ścieżka jest pusta — dodaj kafelki na mapie lub w linii.</p>
        )}
        {ordered.map((n) => {
          if (n.kind === 'comment') return null // komentarze nie wchodzą do skryptu
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
