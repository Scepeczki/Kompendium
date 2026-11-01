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
  /** Wybrana strona kafelka; null = główna treść. */
  subpageId: string | null
  onSubpageChange?: (id: string | null) => void
  onOpenConcept?: (id: string) => void
  onJumpToSource?: (ref: SourceRef) => void
  /** Dymki wyjaśniające, co oznacza wybór w danym widoku. */
  pickHint?: string
  /** Strony kafelka podane z zewnątrz — oszczędza osobne zapytanie na blok. */
  subsZewn?: Subpage[]
  /** Strzałka „otwórz kafelek" w nagłówku. W Linii zbędna — tam menu pod
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
  /** Nazwa nadana kafelkowi w ścieżce — zamiast nazwy kafelka. */
  nazwaWlasna?: string
  /** Treść napisana w ścieżce — zamiast treści kafelka. */
  trescWlasna?: string
  /** Bez paska nad treścią (wersja, plakietka własnego tekstu). W Linii
   *  jedno i drugie siedzi pod prawym przyciskiem, żeby kafelek pokazywał
   *  tekst, a nie metryczkę. */
  bezPaskaWersji?: boolean
  /** Numer w Skrypcie („3.4") — kafelek czyta się wtedy jak akapit książki. */
  numer?: string
  /** Plakietka w nagłówku: skąd pochodzi tekst tego kafelka. */
  pochodzenie?: boolean
  /** Przycisk w nagłówku (np. „Wyślij do biblioteki"). */
  dzialanie?: React.ReactNode
}

/** Blok kafelka w jednolitej oprawie — używany i w widoku Linia, i w Skrypcie,
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
  nazwaWlasna,
  trescWlasna,
  bezPaskaWersji,
  numer,
  pochodzenie,
  dzialanie,
}: Props) {
  // Strony bierzemy z zewnątrz, jeśli ktoś je już ma. W długiej ścieżce
  // sześćdziesiąt bloków to było sześćdziesiąt osobnych zapytań do bazy,
  // odpalanych przy każdym przerysowaniu — i stąd zacięcia przy przewijaniu.
  const typy = useBlockTypes()
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  const version =
    sorted.find((v) => v.id === versionId) ??
    sorted.find((v) => v.id === concept.currentVersionId)

  const pobrane =
    useLiveQuery(
      () =>
        subsZewn || !version
          ? Promise.resolve([] as Subpage[])
          : db.subpages
              .where('[conceptId+versionId]')
              .equals([concept.id, version.id])
              .sortBy('order'),
      [concept.id, version?.id, !!subsZewn],
    ) ?? []
  // strony należą do wersji — z zewnątrz przychodzą wszystkie, więc odsiewamy
  const subs = (subsZewn ?? pobrane).filter((s) => s.versionId === version?.id)
  const sub = subs.find((s) => s.id === subpageId) ?? null
  // Tekst napisany w ścieżce ma pierwszeństwo przed tekstem kafelka.
  const content = trescWlasna ?? (sub ? sub.content : (version?.content ?? ''))
  const versionName = (v: BlockVersion) => v.label ?? `wr.${v.version}`
  const ksiazka = numer !== undefined
  const nazwa = nazwaWlasna ?? concept.name

  /** Strony kafelka: w Linii stoją w nagłówku, a w Skrypcie nad treścią.
   *  Nazwy stron tylko wtedy, gdy jest z czego wybierać. */
  const zakladki = subs.length > 0 && (
    <div className="block-pages">
      <button
        className={`block-page ${!sub ? 'active' : ''}`}
        title={pickHint ?? 'Strona kafelka'}
        onClick={() => onSubpageChange?.(null)}
      >
        {mainPageName(concept)}
      </button>
      {subs.map((s) => (
        <button
          key={s.id}
          className={`block-page ${sub?.id === s.id ? 'active' : ''}`}
          title={pickHint ?? 'Strona kafelka'}
          onClick={() => onSubpageChange?.(s.id)}
        >
          {s.name}
        </button>
      ))}
    </div>
  )

  /** Skąd jest tekst: to odpowiada na pytanie, czy pisanie tutaj rusza
   *  bibliotekę, zanim człowiek zacznie pisać. */
  const skad = concept.pathId
    ? { rodzaj: 'tutejszy', napis: 'tutejszy' }
    : trescWlasna !== undefined
      ? { rodzaj: 'sciezka', napis: 'tekst tej ścieżki' }
      : {
          rodzaj: 'biblioteka',
          napis: `z biblioteki · ${version?.label ?? `v${version?.version ?? 1}`}`,
        }

  return (
    <section
      className={`script-block ${ksiazka ? 'ks-blok' : ''}`}
      data-typ={concept.type}
      data-skad={pochodzenie ? skad.rodzaj : undefined}
      style={typy.style(concept.type)}
    >
      {ksiazka && (
        <div className="ks-numer">
          <span className="ks-liczba">{numer}</span>
          <span className="script-block-type type-mini" title={typy.label(concept.type)}>
            {typy.short(concept.type)}
          </span>
        </div>
      )}
      <div className="script-block-glowa">
      <header className="script-block-head">
        <h3 className="script-block-title">
          {ksiazka ? (
            <span className="ks-slowo">
              {typy.label(concept.type)} {numer}
            </span>
          ) : (
            <span className="script-block-type type-mini" title={typy.label(concept.type)}>
              {typy.short(concept.type)}
            </span>
          )}{' '}
          {onRename ? (
            <input
              className="inline-title"
              value={nazwaWlasna ?? concept.name}
              title="Nazwa kafelka w tej ścieżce — kafelek w bibliotece zostaje bez zmian"
              onChange={(e) => onRename(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : ksiazka ? (
            <span className="ks-nazwa">{nazwa}</span>
          ) : (
            nazwa
          )}
        </h3>
        {!ksiazka && zakladki}
        {pochodzenie && (
          <span className="block-pochodzenie" data-rodzaj={skad.rodzaj}>
            {skad.napis}
          </span>
        )}
        {dzialanie}
        {onOpenConcept && showOpen && (
          <button
            className="script-block-open"
            title="Otwórz kafelek w edytorze"
            onClick={() => onOpenConcept(concept.id)}
          >
            ↗
          </button>
        )}
      </header>

      <div className="script-block-body">
        {version && !bezPaskaWersji && !(ksiazka && sorted.length < 2) && (
          <div className="block-pick block-pick-version">
            {/* „WR.2" samo z siebie nic nie mówi — stąd słowo z przodu */}
            <span className="block-pick-etykieta">wersja</span>
            {sorted.length > 1 && onVersionChange ? (
              <>
                <select
                  className="block-pick-select"
                  value={version.id}
                  title={pickHint ?? 'Wersja kafelka'}
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
                {/* daszek widoczny zawsze: bez niego wybór wygląda jak napis */}
                <span className="block-pick-daszek">⌄</span>
              </>
            ) : (
              <span className="block-pick-static">{versionName(version)}</span>
            )}
          </div>
        )}

        <div className="block-content">
          {ksiazka && zakladki}
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
      </div>
      </div>
      <div className="block-stopka">
        <SourceList refs={version?.sourceRefs ?? []} onJump={onJumpToSource} />
        <div className="block-narzedzia" />
      </div>
    </section>
  )
}
