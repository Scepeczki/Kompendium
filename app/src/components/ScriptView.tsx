import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { SubpageTabs } from './SubpageTabs'
import { SourceList } from './SourceList'
import {
  BLOCK_TYPE_LABELS,
  type BlockVersion,
  type Concept,
  type SourceRef,
} from '../types'

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
  const subpages = useLiveQuery(() => db.subpages.toArray(), []) ?? []
  // Strona wybrana podczas oglądania (per kafelek) — nadpisuje bazową
  // z ustawień ścieżki, ale niczego nie zapisuje.
  const [pageOverride, setPageOverride] = useState<Record<string, string | null>>({})

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

  const blockSection = (
    c: Concept,
    v: BlockVersion | undefined,
    key: string,
    baseSubpageId: string | null,
  ) => {
    const activeId =
      key in pageOverride ? pageOverride[key] : baseSubpageId
    const sub = subpages.find((s) => s.id === activeId) ?? null
    return (
      <section key={key} className={`script-block script-${c.type}`}>
        <header className="script-block-head">
          <h3 className="script-block-title">
            <span className="script-block-type">{BLOCK_TYPE_LABELS[c.type]}:</span>{' '}
            {c.name}
          </h3>
          {v?.label && <span className="script-block-version">{v.label}</span>}
          {onOpenConcept && (
            <button
              className="script-block-open"
              title="Otwórz klocek w edytorze"
              onClick={() => onOpenConcept(c.id)}
            >
              ↗
            </button>
          )}
        </header>
        <div className="script-block-body">
          <SubpageTabs
            conceptId={c.id}
            active={sub?.id ?? null}
            onSelect={(sid) => setPageOverride((o) => ({ ...o, [key]: sid }))}
            hint="Przełącz stronę klocka (tylko podgląd — nie zmienia ścieżki)"
          />
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(sub ? sub.content : (v?.content ?? '')),
            }}
          />
          <SourceList refs={v?.sourceRefs ?? []} onJump={onJumpToSource} />
        </div>
      </section>
    )
  }

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
          if (n.kind === 'heading') {
            const H = (`h${n.level + 1}` as unknown) as 'h2'
            return (
              <H key={n.id} className={`script-heading-node level-${n.level}`}>
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
            const r = resolve(n.conceptId, n.versionId)
            if (!r) return null
            return blockSection(r.concept, r.version, n.id, n.subpageId ?? null)
          }
          // fuzja: wspólna ramka z częściami w środku
          return (
            <section key={n.id} className="script-block script-fusion">
              <header className="script-block-head">
                <h3 className="script-block-title">
                  <span className="script-block-type">Blok:</span> {n.name}
                </h3>
              </header>
              <div className="script-block-body">
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
              </div>
            </section>
          )
        })}
      </article>
    </div>
  )
}
