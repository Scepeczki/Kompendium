import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'

interface Props {
  conceptId: string
  /** Id aktywnej strony (null = główna treść). */
  active: string | null
  onSelect: (id: string | null) => void
  /** Dymek na zakładkach (np. co oznacza wybór w danym widoku). */
  hint?: string
}

/** Zakładki stron klocka (Treść + dowody itp.) — pokazują się tylko, gdy
 *  klocek ma dodatkowe strony. Używane w kafelkach ścieżek i w Skrypcie. */
export function SubpageTabs({ conceptId, active, onSelect, hint }: Props) {
  const subs =
    useLiveQuery(
      () => db.subpages.where('conceptId').equals(conceptId).sortBy('order'),
      [conceptId],
    ) ?? []
  const concept = useLiveQuery(() => db.concepts.get(conceptId), [conceptId])
  const activeSub = subs.find((s) => s.id === active) ?? null
  // Na kafelku mapy przy jednej stronie nie pokazujemy nic: nazwa klocka jest
  // tuż nad, a każdy dodatkowy wiersz podnosi kafelek i psuje rozstawienie.
  // W Linii i Skrypcie nazwa strony jest widoczna zawsze (patrz BlockShell).
  if (subs.length === 0) return null
  return (
    <div className="page-chips nodrag">
      <button
        className={`page-chip ${!activeSub ? 'active' : ''}`}
        title={hint}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(null)
        }}
      >
        {concept ? mainPageName(concept) : 'Treść'}
      </button>
      {subs.map((s) => (
        <button
          key={s.id}
          className={`page-chip ${activeSub?.id === s.id ? 'active' : ''}`}
          title={hint}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(s.id)
          }}
        >
          {s.name}
        </button>
      ))}
    </div>
  )
}
