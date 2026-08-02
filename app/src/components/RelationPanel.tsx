import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addRelation,
  db,
  deleteRelation,
  flipRelation,
  updateRelation,
} from '../db'
import { ConceptPicker } from './ConceptPicker'
import {
  BLOCK_TYPE_SHORT,
  RELATION_KINDS,
  RELATION_LABELS,
  isSymmetricRelation,
  type BlockVersion,
  type Concept,
  type Relation,
  type RelationKind,
} from '../types'

interface Props {
  concept: Concept
  onOpenConcept: (id: string) => void
}

/** Sąsiad w mini-mapie: relacja widziana od strony bieżącego klocka. */
interface Neighbor {
  relation: Relation
  other: Concept | undefined
  /** true = bieżący klocek jest źródłem relacji (etykieta „w przód"). */
  outgoing: boolean
}

/** Kierunek dodawania relacji — przycisk mówi, czym jest WSKAZYWANY klocek
 *  względem bieżącego, żeby nie było wątpliwości, co jest czym. */
interface AddMode {
  kind: RelationKind
  /** true = bieżący klocek staje się źródłem („from"). */
  outgoing: boolean
  label: string
  hint: string
}

const ADD_MODES: AddMode[] = [
  {
    kind: 'zawieranie',
    outgoing: true,
    label: '+ część tego',
    hint: 'Mereologia: wskazany klocek jest pojęciową częścią tego klocka',
  },
  {
    kind: 'zawieranie',
    outgoing: false,
    label: '+ całość',
    hint: 'Mereologia: ten klocek jest częścią wskazanego',
  },
  {
    kind: 'skala',
    outgoing: true,
    label: '+ słabsze (wynika)',
    hint: 'Skala: ten klocek jest mocniejszy/szczegółowszy — ze wskazanego jest słabszy i z tego wynika',
  },
  {
    kind: 'skala',
    outgoing: false,
    label: '+ mocniejsze',
    hint: 'Skala: wskazany klocek jest mocniejszy/szczegółowszy, a ten z niego wynika',
  },
  {
    kind: 'perspektywa',
    outgoing: true,
    label: '+ inna perspektywa',
    hint: 'Epistemologia: dwa różne spojrzenia na ten sam zbiór znaczeń',
  },
]

/** Powiązania klocka: lokalna mapa sąsiedztwa zamiast globalnego grafu.
 *  Trzy osie — zawieranie (mereologia), skala (taksonomia i wnioskowanie),
 *  perspektywa (epistemologia). Każdy koniec relacji można zawęzić do
 *  konkretnej wersji, bo jedna perspektywa bywa uogólnieniem, a inna nie. */
export function RelationPanel({ concept, onOpenConcept }: Props) {
  const [open, setOpen] = useState(
    () => localStorage.getItem('ui.relations') !== '0',
  )
  const toggle = () => {
    const next = !open
    setOpen(next)
    localStorage.setItem('ui.relations', next ? '1' : '0')
  }
  const [picking, setPicking] = useState<AddMode | null>(null)

  const concepts = useLiveQuery(() => db.concepts.toArray(), []) ?? []
  const relations = useLiveQuery(() => db.relations.toArray(), []) ?? []
  const versions =
    useLiveQuery(
      () => db.versions.where('conceptId').equals(concept.id).toArray(),
      [concept.id],
    ) ?? []
  const myVersions = [...versions].sort((a, b) => a.version - b.version)

  const byId = (id: string) => concepts.find((c) => c.id === id)
  const neighbors: Neighbor[] = relations
    .filter((r) => r.fromId === concept.id || r.toId === concept.id)
    .map((r) => {
      const outgoing = r.fromId === concept.id
      return { relation: r, other: byId(outgoing ? r.toId : r.fromId), outgoing }
    })

  /** Etykieta relacji z punktu widzenia bieżącego klocka. */
  const label = (n: Neighbor) =>
    n.outgoing
      ? RELATION_LABELS[n.relation.kind].forward
      : RELATION_LABELS[n.relation.kind].backward

  const grouped = RELATION_KINDS.flatMap((kind) => {
    const of = neighbors.filter((n) => n.relation.kind === kind)
    // rozdzielamy kierunki, żeby „zawiera" i „jest częścią" nie mieszały się
    const dirs = isSymmetricRelation(kind) ? [true] : [true, false]
    return dirs
      .map((outgoing) => ({
        key: `${kind}-${outgoing}`,
        kind,
        items: of
          .filter((n) => isSymmetricRelation(kind) || n.outgoing === outgoing)
          .sort((a, b) => (a.other?.name ?? '').localeCompare(b.other?.name ?? '', 'pl')),
      }))
      .filter((g) => g.items.length > 0)
  })

  const handlePick = async (target: Concept) => {
    if (!picking) return
    const [from, to] = picking.outgoing
      ? [concept.id, target.id]
      : [target.id, concept.id]
    await addRelation(from, to, picking.kind)
    setPicking(null)
  }

  const handleNote = async (r: Relation) => {
    const note = window.prompt(
      'Dopisek do relacji (np. „n = 1" przy uszczegółowieniu):',
      r.note ?? '',
    )
    if (note === null) return
    await updateRelation(r.id, { note: note.trim() || undefined })
  }

  /** Zakres po stronie bieżącego klocka: cały klocek albo jedna wersja. */
  const scopeOf = (n: Neighbor) =>
    (n.outgoing ? n.relation.fromVersionId : n.relation.toVersionId) ?? ''

  const setScope = (n: Neighbor, versionId: string) =>
    updateRelation(n.relation.id,
      n.outgoing
        ? { fromVersionId: versionId || null }
        : { toVersionId: versionId || null },
    )

  const versionName = (v: BlockVersion) => v.label ?? `wr.${v.version}`

  return (
    <section className={`relations ${open ? '' : 'collapsed'}`}>
      <header className="relations-head">
        <button className="relations-toggle" onClick={toggle}>
          <span className={`folder-chevron ${open ? 'open' : ''}`}>▸</span>
          Powiązania
          <span className="source-list-count">{neighbors.length}</span>
        </button>
        {open && (
          <div className="relations-add">
            {ADD_MODES.map((m) => (
              <button
                key={`${m.kind}-${m.outgoing}`}
                className={`btn relations-add-btn rel-${m.kind}`}
                title={m.hint}
                onClick={() => setPicking(m)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {open && (
        <div className="relations-body">
          {neighbors.length === 0 && (
            <p className="relations-empty">
              Brak powiązań. Trzy osie: <b>zawieranie</b> (co jest częścią czego),
              <b> skala</b> (co jest mocniejsze/szczegółowsze i z czego co wynika),
              <b> perspektywa</b> (dwa spojrzenia na to samo).
            </p>
          )}

          {neighbors.length > 0 && (
            <div className="minimap">
              <div className="minimap-center">
                <span className={`type-mini type-${concept.type}`}>
                  {BLOCK_TYPE_SHORT[concept.type]}
                </span>
                {concept.name}
              </div>
              {grouped.map((g) => (
                <div key={g.key} className={`minimap-group rel-${g.kind}`}>
                  <span className="minimap-group-label">
                    {g.items[0] ? label(g.items[0]) : RELATION_LABELS[g.kind].forward}
                  </span>
                  <div className="minimap-items">
                    {g.items.map((n) => (
                      <span key={n.relation.id} className="minimap-item">
                        <button
                          className="minimap-open"
                          title={
                            n.other ? `Otwórz „${n.other.name}"` : 'Klocek został usunięty'
                          }
                          onClick={() => n.other && onOpenConcept(n.other.id)}
                        >
                          {n.other ? (
                            <>
                              <span className={`type-mini type-${n.other.type}`}>
                                {BLOCK_TYPE_SHORT[n.other.type]}
                              </span>
                              {n.other.name}
                            </>
                          ) : (
                            '(usunięty klocek)'
                          )}
                          {n.relation.note && (
                            <span className="minimap-note">{n.relation.note}</span>
                          )}
                        </button>
                        {myVersions.length > 1 && (
                          <select
                            className="minimap-scope"
                            value={scopeOf(n)}
                            title="Czego dotyczy relacja po stronie tego klocka — jedna perspektywa bywa uogólnieniem, a inna nie"
                            onChange={(e) => setScope(n, e.target.value)}
                          >
                            <option value="">cały klocek</option>
                            {myVersions.map((v) => (
                              <option key={v.id} value={v.id}>
                                {versionName(v)}
                              </option>
                            ))}
                          </select>
                        )}
                        <span className="minimap-actions">
                          <button
                            className="folder-action"
                            title="Dopisek (np. wartość parametru)"
                            onClick={() => handleNote(n.relation)}
                          >
                            ✎
                          </button>
                          {!isSymmetricRelation(n.relation.kind) && (
                            <button
                              className="folder-action"
                              title="Odwróć kierunek relacji"
                              onClick={() => flipRelation(n.relation.id)}
                            >
                              ⇄
                            </button>
                          )}
                          <button
                            className="folder-action"
                            title="Usuń powiązanie (klocki zostają)"
                            onClick={() => deleteRelation(n.relation.id)}
                          >
                            ×
                          </button>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {picking && (
        <ConceptPicker
          title={`Powiązanie: ${picking.label.replace('+ ', '')} — wskaż klocek`}
          excludeIds={[concept.id]}
          onPick={handlePick}
          onClose={() => setPicking(null)}
        />
      )}
    </section>
  )
}
