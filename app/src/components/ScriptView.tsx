import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { BlockShell } from './BlockShell'
import { Outline, outlineId, type OutlineItem } from './Outline'
import type { SourceRef } from '../types'

interface Props {
  pathId: string
  /** Otwarcie klocka w edytorze (przycisk w nagłówku bloku). */
  onOpenConcept?: (id: string) => void
  /** Skok do miejsca w PDF (klik w źródło pod treścią). */
  onJumpToSource?: (ref: SourceRef) => void
}

/** Treść skryptu: ścieżka złożona w jeden ciągły dokument.
 *  Osadzana jako trzeci tryb widoku ścieżki (obok Mapy i Linii). */
export function ScriptBody({ pathId, onOpenConcept, onJumpToSource }: Props) {
  const path = useLiveQuery(() => db.paths.get(pathId), [pathId])
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const versions = useLiveQuery(() => db.versions.toArray(), []) ?? []
  // Wybór podczas oglądania (per kafelek) — nadpisuje ustawienia ścieżki,
  // ale niczego nie zapisuje: to tylko sposób czytania, nie zmiana skryptu.
  const [pageOverride, setPageOverride] = useState<Record<string, string | null>>({})
  const [verOverride, setVerOverride] = useState<Record<string, string | null>>({})

  if (!path) return null

  const conceptById = new Map(concepts.map((c) => [c.id, c]))

  const blockSection = (
    conceptId: string,
    key: string,
    baseVersionId: string | null,
    baseSubpageId: string | null,
  ) => {
    const c = conceptById.get(conceptId)
    if (!c) return null
    return (
      <BlockShell
        key={key}
        concept={c}
        versions={versions.filter((v) => v.conceptId === c.id)}
        versionId={key in verOverride ? verOverride[key] : baseVersionId}
        onVersionChange={(id) => setVerOverride((o) => ({ ...o, [key]: id }))}
        subpageId={key in pageOverride ? pageOverride[key] : baseSubpageId}
        onSubpageChange={(id) => setPageOverride((o) => ({ ...o, [key]: id }))}
        onOpenConcept={onOpenConcept}
        onJumpToSource={onJumpToSource}
        pickHint="Przełącz przy czytaniu — nie zmienia ustawień ścieżki"
      />
    )
  }

  const ordered = topoOrder(path.nodes, path.edges)
  const outline: OutlineItem[] = ordered
    .filter((n) => n.kind === 'heading')
    .map((n) => ({ domId: outlineId(n.id), text: n.text, level: n.level }))

  return (
    <div className="script-embed">
      <Outline items={outline} />
      <article className="script-body">
        <h1 className="script-heading">{path.name}</h1>
        {ordered.length === 0 && (
          <p className="hint">Ta ścieżka jest pusta — dodaj kafelki na mapie lub w linii.</p>
        )}
        {ordered.map((n) => {
          if (n.kind === 'comment') return null // komentarze nie wchodzą do skryptu
          if (n.kind === 'heading') {
            const H = (`h${n.level + 1}` as unknown) as 'h2'
            return (
              <H
                key={n.id}
                id={outlineId(n.id)}
                className={`script-heading-node level-${n.level}`}
              >
                {n.text}
              </H>
            )
          }
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
            return blockSection(n.conceptId, n.id, n.versionId, n.subpageId ?? null)
          }
          // grupa: ramka z nazwą nadaną w tej ścieżce, a w środku pełne klocki
          // jeden pod drugim — to nadal osobne klocki, tylko pokazane razem
          return (
            <section key={n.id} className="script-group">
              <header className="script-group-head">
                <h3 className="script-group-name">{n.name}</h3>
              </header>
              <div className="script-group-body">
                {n.parts.map((p, i) =>
                  blockSection(p.conceptId, `${n.id}:${i}`, p.versionId, null),
                )}
              </div>
            </section>
          )
        })}
      </article>
    </div>
  )
}
