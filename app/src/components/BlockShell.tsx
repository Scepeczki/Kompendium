import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'
import { renderMarkdown } from '../markdown'
import { SourceList } from './SourceList'
import { type BlockVersion, type Concept, type SourceRef } from '../types'
import { useBlockTypes } from '../blockTypes'

interface Props {
  concept: Concept
  /** Wszystkie wersje pojęcia (nieposortowane). */
  versions: BlockVersion[]
  /** Wybrana wersja; null = bieżąca. */
  versionId: string | null
  onVersionChange?: (id: string | null) => void
  /** Wybrana strona klocka; null = główna treść. */
  subpageId: string | null
  onSubpageChange?: (id: string | null) => void
  onOpenConcept?: (id: string) => void
  onJumpToSource?: (ref: SourceRef) => void
  /** Dymki wyjaśniające, co oznacza wybór w danym widoku. */
  pickHint?: string
}

/** Blok klocka w jednolitej oprawie — używany i w widoku Linia, i w Skrypcie,
 *  żeby oba wyglądały dokładnie tak samo. Kolejność elementów:
 *  pasek nagłówka → wersja → strony i treść → stopka ze źródłami. */
export function BlockShell({
  concept,
  versions,
  versionId,
  onVersionChange,
  subpageId,
  onSubpageChange,
  onOpenConcept,
  onJumpToSource,
  pickHint,
}: Props) {
  const subs =
    useLiveQuery(
      () => db.subpages.where('conceptId').equals(concept.id).sortBy('order'),
      [concept.id],
    ) ?? []

  const typy = useBlockTypes()
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  const version =
    sorted.find((v) => v.id === versionId) ??
    sorted.find((v) => v.id === concept.currentVersionId)
  const sub = subs.find((s) => s.id === subpageId) ?? null
  const content = sub ? sub.content : (version?.content ?? '')
  const versionName = (v: BlockVersion) => v.label ?? `wr.${v.version}`

  return (
    <section className="script-block" data-typ={concept.type} style={typy.style(concept.type)}>
      <header className="script-block-head">
        <h3 className="script-block-title">
          <span className="script-block-type">{typy.label(concept.type)}:</span>{' '}
          {concept.name}
        </h3>
        {onOpenConcept && (
          <button
            className="script-block-open"
            title="Otwórz klocek w edytorze"
            onClick={() => onOpenConcept(concept.id)}
          >
            ↗
          </button>
        )}
      </header>

      <div className="script-block-body">
        {version && (
          <div className="block-pick block-pick-version">
            {sorted.length > 1 && onVersionChange ? (
              <select
                className="block-pick-select"
                value={version.id}
                title={pickHint ?? 'Wersja klocka'}
                onChange={(e) =>
                  onVersionChange(
                    e.target.value === concept.currentVersionId ? null : e.target.value,
                  )
                }
              >
                {sorted.map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionName(v)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="block-pick-static">{versionName(version)}</span>
            )}
          </div>
        )}

        <div className="block-content">
          {subs.length > 0 && (
            <div className="block-pages">
              <button
                className={`block-page ${!sub ? 'active' : ''}`}
                title={pickHint ?? 'Strona klocka'}
                onClick={() => onSubpageChange?.(null)}
              >
                {mainPageName(concept)}
              </button>
              {subs.map((s) => (
                <button
                  key={s.id}
                  className={`block-page ${sub?.id === s.id ? 'active' : ''}`}
                  title={pickHint ?? 'Strona klocka'}
                  onClick={() => onSubpageChange?.(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        </div>

        <SourceList refs={version?.sourceRefs ?? []} onJump={onJumpToSource} />
      </div>
    </section>
  )
}
