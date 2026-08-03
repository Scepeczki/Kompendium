import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { renderMarkdown } from '../markdown'
import {
  BLOCK_TYPE_SHORT,
  isSymmetricRelation,
  neighborGroupLabel,
  type Concept,
  type Relation,
} from '../types'

interface Props {
  concept: Concept
  onOpenConcept?: (id: string) => void
}

interface Item {
  relation: Relation
  other: Concept
  outgoing: boolean
}

/** Powiązania pod treścią bloku w Linii i Skrypcie: klocek ogólny „przykrywa"
 *  swoje przypadki szczególne — są wypisane, ale zwinięte, i można je rozwinąć
 *  w miejscu, bez opuszczania skryptu. Działa tak samo dla części i perspektyw. */
export function RelatedStrip({ concept, onOpenConcept }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const relations = useLiveQuery(() => db.relations.toArray(), []) ?? []
  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const versions = useLiveQuery(() => db.versions.toArray(), []) ?? []

  const items: Item[] = relations
    .filter((r) => r.fromId === concept.id || r.toId === concept.id)
    .flatMap((r) => {
      const outgoing = r.fromId === concept.id
      const other = concepts.find((c) => c.id === (outgoing ? r.toId : r.fromId))
      return other ? [{ relation: r, other, outgoing }] : []
    })

  if (items.length === 0) return null

  const label = (i: Item) => neighborGroupLabel(i.relation.kind, i.outgoing)

  /** Treść wskazanej wersji sąsiada (albo bieżącej). */
  const contentOf = (i: Item) => {
    const scoped = i.outgoing ? i.relation.toVersionId : i.relation.fromVersionId
    const v =
      versions.find((x) => x.id === scoped) ??
      versions.find((x) => x.id === i.other.currentVersionId)
    return v?.content ?? ''
  }

  // grupujemy po etykiecie, żeby „szczególne przypadki" stały razem
  const groups = [...new Set(items.map(label))].map((l) => ({
    label: l,
    items: items
      .filter((i) => label(i) === l)
      .sort((a, b) => a.other.name.localeCompare(b.other.name, 'pl')),
  }))

  return (
    <div className="related-strip">
      {groups.map((g) => (
        <div key={g.label} className="related-group">
          <span className="related-label">{g.label}:</span>
          <span className="related-items">
            {g.items.map((i) => (
              <span key={i.relation.id} className="related-item">
                <button
                  className={`related-chip rel-${i.relation.kind} ${
                    expanded === i.relation.id ? 'active' : ''
                  }`}
                  title={
                    isSymmetricRelation(i.relation.kind)
                      ? 'Inne spojrzenie na to samo — rozwiń, aby zobaczyć treść'
                      : 'Rozwiń, aby zobaczyć treść tutaj'
                  }
                  onClick={() =>
                    setExpanded((e) => (e === i.relation.id ? null : i.relation.id))
                  }
                >
                  <span className={`type-mini type-${i.other.type}`}>
                    {BLOCK_TYPE_SHORT[i.other.type]}
                  </span>
                  {i.other.name}
                  {i.relation.note && (
                    <span className="related-note">{i.relation.note}</span>
                  )}
                </button>
              </span>
            ))}
          </span>
        </div>
      ))}

      {expanded &&
        (() => {
          const i = items.find((x) => x.relation.id === expanded)
          if (!i) return null
          return (
            <div className="related-expanded">
              <div className="related-expanded-head">
                <span className={`type-mini type-${i.other.type}`}>
                  {BLOCK_TYPE_SHORT[i.other.type]}
                </span>
                <span className="related-expanded-name">{i.other.name}</span>
                {onOpenConcept && (
                  <button
                    className="script-block-open"
                    title="Otwórz ten klocek w edytorze"
                    onClick={() => onOpenConcept(i.other.id)}
                  >
                    ↗
                  </button>
                )}
                <button
                  className="script-block-open"
                  title="Zwiń"
                  onClick={() => setExpanded(null)}
                >
                  ✕
                </button>
              </div>
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(contentOf(i)) }}
              />
            </div>
          )
        })()}
    </div>
  )
}
