import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'
import { renderMarkdown } from '../markdown'
import { SourceList } from './SourceList'
import {
  kluczWlasnej,
  type BlockType,
  type BlockVersion,
  type Concept,
  type FusionPart,
  type SourceRef,
  type Subpage,
} from '../types'
import { useBlockTypes } from '../blockTypes'

export type GroupPart = FusionPart

interface Props {
  name: string
  /** Czym jest grupa jako całość — wygląda wtedy jak zwykły blok tego typu. */
  type?: BlockType
  parts: GroupPart[]
  /** Przepisana treść całości. Gdy jest, zastępuje treści składników. */
  content?: string
  onVersionChange?: (index: number, versionId: string | null) => void
  onSubpageChange?: (index: number, subpageId: string | null) => void
  onJumpToSource?: (ref: SourceRef) => void
  pickHint?: string
  // ---- edycja na miejscu (widok Linia) ----
  onRename?: (name: string) => void
  edytor?: React.ReactNode
  onStartEdit?: () => void
  /** Klocki/wersje/strony podane z zewnątrz. Linia ma je już wczytane dla
   *  całej ścieżki; bez tego każdy scalony blok czytałby trzy całe tabele. */
  zewn?: { concepts: Concept[]; versions: BlockVersion[]; subpages: Subpage[] }
  /** Pole do pisania dla POJEDYNCZEGO składnika. Dzięki niemu scalony blok
   *  bez własnej treści nie jest tylko do czytania: pisze się w nim po każdym
   *  klocku z osobna, a tekst idzie do tego klocka w bazie. */
  edytorCzesci?: (
    i: number,
    dane: {
      versionId: string
      subpageId: string | null
      tresc: string
      biezaca: boolean
    },
  ) => React.ReactNode
  /** Porzucenie własnego tekstu składnika — powrót do treści klocka. */
  onWrocCzesc?: (i: number, versionId: string, subpageId: string | null) => void
}

/** Grupa klocków pokazana jako JEDEN blok: pasek nagłówka z nazwą nadaną
 *  w ścieżce, a w środku same treści klocków jedna pod drugą — bez ich
 *  własnych ramek i tytułów. W bazie to nadal osobne klocki. */
export function GroupShell({
  name,
  type,
  parts,
  content,
  onVersionChange,
  onSubpageChange,
  onJumpToSource,
  pickHint,
  onRename,
  edytor,
  onStartEdit,
  zewn,
  edytorCzesci,
  onWrocCzesc,
}: Props) {
  const wlasneKlocki =
    useLiveQuery(
      () => (zewn ? Promise.resolve([] as Concept[]) : db.concepts.toArray()),
      [!!zewn],
    ) ?? []
  const wlasneWersje =
    useLiveQuery(
      () => (zewn ? Promise.resolve([] as BlockVersion[]) : db.versions.toArray()),
      [!!zewn],
    ) ?? []
  const wlasneStrony =
    useLiveQuery(
      () => (zewn ? Promise.resolve([] as Subpage[]) : db.subpages.toArray()),
      [!!zewn],
    ) ?? []
  const concepts = zewn?.concepts ?? wlasneKlocki
  const versions = zewn?.versions ?? wlasneWersje
  const subpages = zewn?.subpages ?? wlasneStrony

  const resolved = parts.map((p) => {
    const concept = concepts.find((c) => c.id === p.conceptId)
    const own = versions
      .filter((v) => v.conceptId === p.conceptId)
      .sort((a, b) => a.version - b.version)
    const version =
      own.find((v) => v.id === p.versionId) ??
      own.find((v) => v.id === concept?.currentVersionId)
    const strony = subpages
      .filter((s) => s.conceptId === p.conceptId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const strona = strony.find((s) => s.id === p.subpageId) ?? null
    // treść składnika: najpierw ta napisana w ścieżce, potem wybrana strona
    // albo strona główna z wersji
    const wlasna = version ? p.wlasneTresci?.[kluczWlasnej(version.id, strona?.id)] : undefined
    const tresc = wlasna ?? (strona ? strona.content : (version?.content ?? ''))
    return { concept, own, version, strony, strona, tresc, wlasna }
  })

  // źródła całej grupy razem — grupa czyta się jak jeden blok
  const typy = useBlockTypes()
  const refs: SourceRef[] = resolved.flatMap((r) => r.version?.sourceRefs ?? [])
  const versionName = (v: BlockVersion) => v.label ?? `wr.${v.version}`

  return (
    <section
      className="script-block script-group-block"
      data-typ={type}
      style={type ? typy.style(type) : undefined}
    >
      <header className="script-block-head">
        <h3 className="script-block-title">
          <span className="script-block-type">
            {type ? typy.label(type) : 'Grupa'}:
          </span>{' '}
          {onRename ? (
            <input
              className="inline-title"
              value={name}
              title="Nazwa scalonego bloku — istnieje tylko w tej ścieżce"
              onChange={(e) => onRename(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            name
          )}
        </h3>
      </header>

      <div className="script-block-body">
        {content !== undefined ? (
          // przepisana całość — jeden tekst zamiast poskładanych kawałków
          <div className="block-content">
            {edytor ?? (
              <div
                className={`markdown-body ${onStartEdit ? 'do-pisania' : ''}`}
                onClick={(e) => {
                  if ((e.target as Element).closest('a, button, select')) return
                  if (e.ctrlKey || e.metaKey || e.shiftKey) return
                  onStartEdit?.()
                }}
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(
                    content ||
                      (onStartEdit
                        ? '<p class="note-empty">pusto — kliknij, aby pisać</p>'
                        : ''),
                  ),
                }}
              />
            )}
          </div>
        ) : (
        <div className="block-content">
          {resolved.map((r, i) => (
            <div key={`${parts[i].conceptId}-${i}`} className="group-part">
              {r.strony.length === 0 && (
                <div className="block-pages group-part-pages">
                  <span className="page-chip-static">
                    {mainPageName(r.concept ?? {})}
                  </span>
                </div>
              )}
              {r.strony.length > 0 && onSubpageChange && (
                <div className="block-pages group-part-pages">
                  <button
                    className={`page-chip ${r.strona ? '' : 'active'}`}
                    title={`Strona główna klocka „${r.concept?.name ?? ''}"`}
                    onClick={() => onSubpageChange(i, null)}
                  >
                    {mainPageName(r.concept ?? {})}
                  </button>
                  {r.strony.map((s) => (
                    <button
                      key={s.id}
                      className={`page-chip ${r.strona?.id === s.id ? 'active' : ''}`}
                      onClick={() => onSubpageChange(i, s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {r.version && (
                <div className="block-pick block-pick-version">
                  {r.own.length > 1 && onVersionChange ? (
                    <select
                      className="block-pick-select"
                      value={r.version.id}
                      title={
                        pickHint ??
                        `Wersja klocka „${r.concept?.name ?? ''}" w tej grupie`
                      }
                      onChange={(e) =>
                        onVersionChange(
                          i,
                          e.target.value === r.concept?.currentVersionId
                            ? null
                            : e.target.value,
                        )
                      }
                    >
                      {r.own.map((v) => (
                        <option key={v.id} value={v.id}>
                          {versionName(v)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="block-pick-static">{versionName(r.version)}</span>
                  )}
                  {/* składnik pisany w ścieżce — tak samo jak zwykły kafelek
                      musi mówić, że odciął się od klocka */}
                  {r.wlasna !== undefined && (
                    <span className="block-wlasny">
                      <span
                        className="block-wlasny-znak"
                        title="Ten tekst należy do ścieżki. Klocek w bibliotece ma swój własny."
                      >
                        tekst tej ścieżki
                      </span>
                      {onWrocCzesc && (
                        <button
                          className="block-wlasny-wroc"
                          title="Porzuć tekst napisany tutaj i pokazuj z powrotem treść klocka"
                          onClick={() =>
                            onWrocCzesc(i, r.version!.id, r.strona?.id ?? null)
                          }
                        >
                          wróć do klocka
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )}
              {edytorCzesci && r.concept && r.version ? (
                edytorCzesci(i, {
                  versionId: r.version.id,
                  subpageId: r.strona?.id ?? null,
                  tresc: r.tresc,
                  biezaca: r.version.id === r.concept.currentVersionId,
                })
              ) : (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(r.concept ? r.tresc : '(usunięty klocek)'),
                  }}
                />
              )}
            </div>
          ))}
        </div>
        )}

        <SourceList refs={refs} onJump={onJumpToSource} />
      </div>
    </section>
  )
}
