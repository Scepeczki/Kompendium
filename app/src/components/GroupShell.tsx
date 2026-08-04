import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import { SourceList } from './SourceList'
import { type BlockType, type BlockVersion, type SourceRef } from '../types'
import { useBlockTypes } from '../blockTypes'

export interface GroupPart {
  conceptId: string
  versionId: string | null
}

interface Props {
  name: string
  /** Czym jest grupa jako całość — wygląda wtedy jak zwykły blok tego typu. */
  type?: BlockType
  parts: GroupPart[]
  onVersionChange?: (index: number, versionId: string | null) => void
  onJumpToSource?: (ref: SourceRef) => void
  pickHint?: string
}

/** Grupa klocków pokazana jako JEDEN blok: pasek nagłówka z nazwą nadaną
 *  w ścieżce, a w środku same treści klocków jedna pod drugą — bez ich
 *  własnych ramek i tytułów. W bazie to nadal osobne klocki. */
export function GroupShell({
  name,
  type,
  parts,
  onVersionChange,
  onJumpToSource,
  pickHint,
}: Props) {
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const versions = useLiveQuery(() => db.versions.toArray(), []) ?? []

  const resolved = parts.map((p) => {
    const concept = concepts.find((c) => c.id === p.conceptId)
    const own = versions
      .filter((v) => v.conceptId === p.conceptId)
      .sort((a, b) => a.version - b.version)
    const version =
      own.find((v) => v.id === p.versionId) ??
      own.find((v) => v.id === concept?.currentVersionId)
    return { concept, own, version }
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
          {name}
        </h3>
      </header>

      <div className="script-block-body">
        <div className="block-content">
          {resolved.map((r, i) => (
            <div key={`${parts[i].conceptId}-${i}`} className="group-part">
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
                </div>
              )}
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(
                    r.concept ? (r.version?.content ?? '') : '(usunięty klocek)',
                  ),
                }}
              />
            </div>
          ))}
        </div>

        <SourceList refs={refs} onJump={onJumpToSource} />
      </div>
    </section>
  )
}
