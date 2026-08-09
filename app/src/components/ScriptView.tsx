import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { BlockShell } from './BlockShell'
import { GroupShell } from './GroupShell'
import { Outline, outlineId, type OutlineItem } from './Outline'
import { kluczWlasnej, type PathNodeBlock, type SourceRef } from '../types'

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

  const blockSection = (n: PathNodeBlock) => {
    const c = conceptById.get(n.conceptId)
    if (!c) return null
    const key = n.id
    const wlasne = versions.filter((v) => v.conceptId === c.id)
    const versionId = key in verOverride ? verOverride[key] : n.versionId
    const subpageId = key in pageOverride ? pageOverride[key] : (n.subpageId ?? null)
    // ta sama wersja, którą widać w Linii — Skrypt to ta sama ścieżka,
    // tylko złożona do czytania
    const wersja =
      wlasne.find((v) => v.id === versionId) ??
      wlasne.find((v) => v.id === c.currentVersionId)
    const trescWlasna = wersja
      ? n.wlasneTresci?.[kluczWlasnej(wersja.id, subpageId)]
      : undefined
    return (
      <BlockShell
        key={key}
        concept={c}
        versions={wlasne}
        versionId={versionId}
        onVersionChange={(id) => setVerOverride((o) => ({ ...o, [key]: id }))}
        subpageId={subpageId}
        onSubpageChange={(id) => setPageOverride((o) => ({ ...o, [key]: id }))}
        onOpenConcept={onOpenConcept}
        onJumpToSource={onJumpToSource}
        pickHint="Przełącz przy czytaniu — nie zmienia ustawień ścieżki"
        nazwaWlasna={n.nazwa}
        trescWlasna={trescWlasna}
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
          if (n.kind === 'block') return blockSection(n)
          // grupa czyta się jak jeden blok danego typu: pasek nagłówka
          // z nazwą nadaną w ścieżce, a w środku same treści klocków
          return (
            <GroupShell
              key={n.id}
              name={n.name}
              type={n.type}
              parts={n.parts.map((p, i) => ({
                ...p,
                versionId:
                  `${n.id}:${i}` in verOverride
                    ? verOverride[`${n.id}:${i}`]
                    : p.versionId,
                subpageId: p.subpageId ?? null,
              }))}
              content={n.content}
              onVersionChange={(i, id) =>
                setVerOverride((o) => ({ ...o, [`${n.id}:${i}`]: id }))
              }
              onJumpToSource={onJumpToSource}
              pickHint="Przełącz przy czytaniu — nie zmienia ustawień ścieżki"
            />
          )
        })}
      </article>
    </div>
  )
}
