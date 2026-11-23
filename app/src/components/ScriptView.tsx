import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { topoOrder } from '../topo'
import { BlockShell } from './BlockShell'
import { GroupShell } from './GroupShell'
import { Outline, outlineId, pozycjeSpisu, stylRozdzialu, stylTekstu } from './Outline'
import { useBlockTypes } from '../blockTypes'
import { kluczWlasnej, type PathNodeBlock, type SourceRef } from '../types'

interface Props {
  pathId: string
  /** Otwarcie kafelka w edytorze (przycisk w nagłówku bloku). */
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
  const typy = useBlockTypes()

  if (!path) return null

  const conceptById = new Map(concepts.map((c) => [c.id, c]))

  const blockSection = (n: PathNodeBlock, numer: string) => {
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
        numer={numer}
      />
    )
  }

  const ordered = topoOrder(path.nodes, path.edges)
  // komentarze nie wchodzą do skryptu, więc i do jego spisu
  const outline = pozycjeSpisu(
    ordered.filter((n) => n.kind !== 'comment'),
    (id) => conceptById.get(id),
    typy,
  )

  /** Numeracja jak w książce: rozdział.pozycja, licząc od nowa w rozdziale. */
  let rozdzial = 0
  let pozycja = 0
  const kolejny = () => {
    pozycja++
    return rozdzial > 0 ? `${rozdzial}.${pozycja}` : String(pozycja)
  }

  return (
    <div className="script-embed">
      <Outline key={path.id} pamiec={path.id} items={outline} />
      <article className="script-body">
        <h1 className="script-heading">{path.name}</h1>
        {ordered.length === 0 && (
          <p className="hint">Ta ścieżka jest pusta — dodaj kafelki na mapie lub w linii.</p>
        )}
        {ordered.map((n) => {
          if (n.kind === 'comment') return null // komentarze nie wchodzą do skryptu
          if (n.kind === 'heading') {
            const H = (`h${Math.min(n.level + 1, 6)}` as unknown) as 'h2'
            if (n.level === 1) {
              rozdzial++
              pozycja = 0
            }
            return (
              <H
                key={n.id}
                id={outlineId(n.id)}
                style={stylRozdzialu(n.rozmiar)}
                data-rozdzial={n.level === 1 ? rozdzial : undefined}
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
                data-seg={n.id}
                className="script-text markdown-body"
                style={stylTekstu(n.rozmiarTekstu)}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(n.text) }}
              />
            )
          }
          if (n.kind === 'block') {
            return (
              <div key={n.id} data-seg={n.id} style={stylTekstu(n.rozmiarTekstu)}>
                {blockSection(n, kolejny())}
              </div>
            )
          }
          // złożony kafelek czyta się jak zwykły blok danego typu
          return (
            <div key={n.id} data-seg={n.id} style={stylTekstu(n.rozmiarTekstu)}>
              <GroupShell
                name={n.name}
                type={n.type}
                parts={n.parts}
                content={n.content}
                strony={n.strony}
                zrodla={n.zrodla}
                onJumpToSource={onJumpToSource}
                numer={kolejny()}
              />
            </div>
          )
        })}
      </article>
    </div>
  )
}
