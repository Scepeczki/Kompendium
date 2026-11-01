import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useBlockTypes } from '../blockTypes'
import { odmien } from '../odmiana'
import { opisZrodla } from './SourceList'
import {
  RELATION_LABELS,
  isPdfSource,
  type BlockVersion,
  type Concept,
  type PathNode,
  type SourceRef,
} from '../types'

interface Props {
  /** Kafelek albo złożony blok, przy którym się pracuje. */
  wezel: PathNode | null
  concepts: Concept[]
  versions: BlockVersion[]
  onJumpToSource: (ref: SourceRef) => void
  onOpenConcept: (id: string) => void
}

/** Prawy panel Linii: to, co nie mieści się w kafelku, a przydaje przy pisaniu
 *  — skąd pochodzi treść i z czym się wiąże. Tylko do czytania. */
export function KontekstKafelka({
  wezel,
  concepts,
  versions,
  onJumpToSource,
  onOpenConcept,
}: Props) {
  const typy = useBlockTypes()
  const pdfs = useLiveQuery(() => db.pdfs.toArray(), []) ?? []
  const paths = useLiveQuery(() => db.paths.toArray(), []) ?? []
  const relations = useLiveQuery(() => db.relations.toArray(), []) ?? []

  const zrodla = (refs: SourceRef[]) =>
    refs.length > 0 && (
      <>
        <h4 className="kontekst-etykieta">Źródła</h4>
        <ul className="kontekst-lista">
          {refs.map((r) => (
            <li key={r.id}>
              <button className="kontekst-link" onClick={() => onJumpToSource(r)}>
                {opisZrodla(r, pdfs, concepts)}
              </button>
              <span className="kontekst-dopisek">
                {isPdfSource(r) ? 'otwórz w PDF' : 'otwórz kafelek'}
              </span>
            </li>
          ))}
        </ul>
      </>
    )

  const tresc = () => {
    if (wezel?.kind === 'fusion') {
      const refs =
        wezel.zrodla ??
        wezel.parts.flatMap((p) => {
          const c = concepts.find((x) => x.id === p.conceptId)
          const w =
            versions.find((v) => v.id === p.versionId) ??
            versions.find((v) => v.id === c?.currentVersionId)
          return w?.sourceRefs ?? []
        })
      return (
        <>
          <div className="kontekst-nazwa">{wezel.name || 'bez nazwy'}</div>
          <div className="kontekst-meta">
            {wezel.type ? `${typy.label(wezel.type)} · ` : ''}
            złożony w tej ścieżce
          </div>
          {zrodla(refs)}
          <h4 className="kontekst-etykieta">Materiały</h4>
          <ul className="kontekst-lista">
            {wezel.parts.map((p, i) => {
              const c = concepts.find((x) => x.id === p.conceptId)
              return (
                <li key={`${p.conceptId}-${i}`}>
                  {c ? (
                    <button className="kontekst-link" onClick={() => onOpenConcept(c.id)}>
                      {c.name}
                    </button>
                  ) : (
                    '(usunięty kafelek)'
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )
    }
    if (wezel?.kind !== 'block') return null
    const c = concepts.find((x) => x.id === wezel.conceptId)
    if (!c) return null
    const wlasne = versions.filter((v) => v.conceptId === c.id)
    const wersja =
      wlasne.find((v) => v.id === wezel.versionId) ??
      wlasne.find((v) => v.id === c.currentVersionId)
    const ileSciezek = paths.filter((p) =>
      p.nodes.some(
        (n) =>
          (n.kind === 'block' && n.conceptId === c.id) ||
          (n.kind === 'fusion' && n.parts.some((x) => x.conceptId === c.id)),
      ),
    ).length
    const powiazania = relations
      .filter((r) => r.fromId === c.id || r.toId === c.id)
      .map((r) => {
        const wychodzi = r.fromId === c.id
        const drugi = concepts.find((x) => x.id === (wychodzi ? r.toId : r.fromId))
        const opis = RELATION_LABELS[r.kind]
        return { id: r.id, drugi, relacja: wychodzi ? opis.forward : opis.backward }
      })
      .filter((p) => p.drugi)
    return (
      <>
        <div className="kontekst-nazwa">{wezel.nazwa ?? c.name}</div>
        <div className="kontekst-meta">
          {typy.label(c.type)} · {odmien(wlasne.length, 'wersja', 'wersje', 'wersji')} ·{' '}
          {odmien(ileSciezek, 'ścieżka', 'ścieżki', 'ścieżek')}
        </div>
        {zrodla(wersja?.sourceRefs ?? [])}
        {powiazania.length > 0 && (
          <>
            <h4 className="kontekst-etykieta">Powiązania</h4>
            <ul className="kontekst-lista">
              {powiazania.map((p) => (
                <li key={p.id}>
                  <span className="kontekst-dopisek">{p.relacja} </span>
                  <button className="kontekst-link" onClick={() => onOpenConcept(p.drugi!.id)}>
                    {p.drugi!.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    )
  }

  const zawartosc = tresc()
  return (
    <aside className="kontekst">
      <h4 className="kontekst-etykieta">Zaznaczony kafelek</h4>
      {zawartosc ?? (
        <p className="kontekst-pusto">Kliknij kafelek, żeby zobaczyć jego źródła i powiązania.</p>
      )}
    </aside>
  )
}
