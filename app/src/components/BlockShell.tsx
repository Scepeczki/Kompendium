import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'
import { renderMarkdown } from '../markdown'
import { SourceList } from './SourceList'
import { type BlockVersion, type Concept, type SourceRef, type Subpage } from '../types'
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
  /** Strony klocka podane z zewnątrz — oszczędza osobne zapytanie na blok. */
  subsZewn?: Subpage[]
  /** Strzałka „otwórz klocek" w nagłówku. W Linii zbędna — tam menu pod
   *  prawym przyciskiem robi to samo, a dwa wejścia mieszają. */
  showOpen?: boolean

  // ---- edycja na miejscu (widok Linia; Skrypt zostaje do czytania) ----
  /** Gdy podane, tytuł jest polem tekstowym, a nie napisem. */
  onRename?: (name: string) => void
  /** Treść w trybie pisania — komponent dostarcza własny edytor. */
  edytor?: React.ReactNode
  /** Klik w treść zaczyna pisanie (gdy edytor nie jest jeszcze włączony). */
  onStartEdit?: () => void
  /** Powód, dla którego pisać nie wolno (np. starsza wersja) — pokazywany
   *  jako dymek, zamiast milczącego braku reakcji. */
  blokada?: string
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
  subsZewn,
  showOpen = true,
  onRename,
  edytor,
  onStartEdit,
  blokada,
}: Props) {
  // Strony bierzemy z zewnątrz, jeśli ktoś je już ma. W długiej ścieżce
  // sześćdziesiąt bloków to było sześćdziesiąt osobnych zapytań do bazy,
  // odpalanych przy każdym przerysowaniu — i stąd zacięcia przy przewijaniu.
  const pobrane =
    useLiveQuery(
      () =>
        subsZewn
          ? Promise.resolve([])
          : db.subpages.where('conceptId').equals(concept.id).sortBy('order'),
      [concept.id, !!subsZewn],
    ) ?? []
  const subs = subsZewn ?? pobrane

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
          {onRename ? (
            <input
              className="inline-title"
              value={concept.name}
              title="Nazwa klocka — zmiana dotyczy klocka wszędzie, nie tylko tutaj"
              onChange={(e) => onRename(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            concept.name
          )}
        </h3>
        {onOpenConcept && showOpen && (
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
          {/* nazwa strony widoczna zawsze — także gdy klocek ma tylko jedną */}
          {subs.length === 0 ? (
            <div className="block-pages">
              <span className="page-chip-static">{mainPageName(concept)}</span>
            </div>
          ) : (
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
          {edytor ?? (
            <div
              className={`markdown-body ${onStartEdit ? 'do-pisania' : ''}`}
              title={blokada}
              onClick={(e) => {
                // odnośniki i przełączniki zostawiamy w spokoju
                if ((e.target as Element).closest('a, button, select')) return
                if (e.ctrlKey || e.metaKey || e.shiftKey) return
                onStartEdit?.()
              }}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(
                  content || (onStartEdit ? '<p class="note-empty">pusto — kliknij, aby pisać</p>' : ''),
                ),
              }}
            />
          )}
        </div>

        <SourceList refs={version?.sourceRefs ?? []} onJump={onJumpToSource} />
      </div>
    </section>
  )
}
