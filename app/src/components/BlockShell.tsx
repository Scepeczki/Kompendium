import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'
import { renderMarkdown } from '../markdown'
import { SourceList } from './SourceList'
import { type BlockVersion, type Concept, type SourceRef, type Subpage } from '../types'
import { useBlockTypes } from '../blockTypes'
import { znajdzTypZadania } from '../nauka'
import { glownaWidoczna, stronaWidoczna } from '../widocznosc'
import { Icon } from './Icon'

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
  /** Oko przy stronach: czy widać ją w teście zakrytym. Bez tej funkcji oko
   *  tylko pokazuje stan (kafelek spoza folderu ścieżki zmienia się w edytorze). */
  onWidocznosc?: (versionId: string, stronaId: string | null, widoczna: boolean) => void
  /** Czy w ogóle pokazywać oczy (Linia i Skrypt do pisania). */
  oczy?: boolean
}

/** Blok kafelka w jednolitej oprawie — używany i w widoku Linia, i w Skrypcie,
 *  żeby oba wyglądały dokładnie tak samo. Kolejność elementów:
 *  pasek nagłówka → wersja → strony i treść → stopka ze źródłami. */
/** Inna strona ma inną długość. Przy końcu ścieżki krótsza strona skracała
 *  całość, przeglądarka cofała przewinięcie i cały widok odjeżdżał. Przez chwilę po kliknięciu
 *  poprawiamy przewinięcie tak, żeby kliknięte zakładki stały tam, gdzie były. */
function trzymajNaMiejscu(zakladka: HTMLElement) {
  const pasek = zakladka.closest('.block-pages') ?? zakladka
  const kafelek = zakladka.closest<HTMLElement>('[data-seg]')
  let pojemnik = pasek.parentElement
  while (pojemnik && !/(auto|scroll)/.test(getComputedStyle(pojemnik).overflowY)) {
    pojemnik = pojemnik.parentElement
  }
  // Zapas pod kafelkiem dajemy od razu, zanim treść się zmieni: wtedy krótsza
  // strona przy końcu ścieżki nie ma czego skracać i widok nie mrugnie.
  if (kafelek && kafelek.dataset.marginesBazowy === undefined) {
    kafelek.dataset.marginesBazowy = kafelek.style.marginBottom
  }
  const zapas = (px: number) => {
    if (!kafelek) return
    kafelek.dataset.zapas = String(px)
    kafelek.style.marginBottom =
      px > 0 ? `calc(${kafelek.dataset.marginesBazowy || '0px'} + ${px}px)` : (kafelek.dataset.marginesBazowy ?? '')
  }
  if (kafelek) zapas(kafelek.getBoundingClientRect().height)

  const start = pasek.getBoundingClientRect().top
  const koniec = performance.now() + 900
  let przerwane = false
  const przerwij = () => (przerwane = true)
  window.addEventListener('wheel', przerwij, { once: true, passive: true })
  const krok = () => {
    // pasek bywa rysowany od nowa, więc szukamy go w tym samym kafelku
    const teraz = pasek.isConnected ? pasek : kafelek?.querySelector('.block-pages')
    if (!przerwane && teraz) {
      const d = teraz.getBoundingClientRect().top - start
      if (Math.abs(d) > 0.5) {
        if (pojemnik) pojemnik.scrollTop += d
        else window.scrollBy(0, d)
      }
    }
    if (performance.now() < koniec && !przerwane) {
      requestAnimationFrame(krok)
      return
    }
    window.removeEventListener('wheel', przerwij)
    // treść się ułożyła: zostaje tylko tyle zapasu, ile trzeba, żeby widok
    // nie musiał się cofnąć
    if (pojemnik && kafelek) {
      const tresc = pojemnik.scrollHeight - (Number(kafelek.dataset.zapas) || 0)
      zapas(Math.max(0, Math.ceil(pojemnik.scrollTop + pojemnik.clientHeight - tresc)))
    }
  }
  requestAnimationFrame(krok)
}

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
  onWidocznosc,
  oczy,
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

  const typZad = znajdzTypZadania(typy.all)
  const oko = (stronaId: string | null, widoczna: boolean) =>
    oczy && version ? (
      <OkoTestu
        widoczna={widoczna}
        onZmien={onWidocznosc ? (w) => onWidocznosc(version.id, stronaId, w) : undefined}
      />
    ) : null
  /** Strony kafelka: w Linii stoją w nagłówku, a w Skrypcie nad treścią.
   *  Nazwy stron tylko wtedy, gdy jest z czego wybierać. */
  const zakladki = subs.length > 0 && (
    <div className="block-pages">
      <span className="block-page-z-okiem">
        <button
          className={`block-page ${!sub ? 'active' : ''}`}
          title={pickHint ?? 'Strona kafelka'}
          onClick={(e) => {
            trzymajNaMiejscu(e.currentTarget)
            onSubpageChange?.(null)
          }}
        >
          {mainPageName(concept)}
        </button>
        {oko(null, glownaWidoczna(version, concept.type, typZad))}
      </span>
      {subs.map((s) => (
        <span key={s.id} className="block-page-z-okiem">
          <button
            className={`block-page ${sub?.id === s.id ? 'active' : ''}`}
            title={pickHint ?? 'Strona kafelka'}
            onClick={(e) => {
              trzymajNaMiejscu(e.currentTarget)
              onSubpageChange?.(s.id)
            }}
          >
            {s.name}
          </button>
          {oko(s.id, stronaWidoczna(s))}
        </span>
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
            <PoleNazwy wartosc={nazwaWlasna ?? concept.name} onZmien={onRename} />
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

/** Pole nazwy kafelka. Podczas pisania trzyma dokładnie to, co wpisujesz —
 *  zapis do ścieżki i (po chwili ciszy) do kafelka idzie w tle, a jego echo
 *  (nazwa przycięta ze spacji, przez moment jeszcze stara z bazy) nie może
 *  podmieniać tekstu pod kursorem. Z bazą wyrównuje się po wyjściu z pola. */
function PoleNazwy({ wartosc, onZmien }: { wartosc: string; onZmien: (t: string) => void }) {
  const [tekst, setTekst] = useState(wartosc)
  const [pisze, setPisze] = useState(false)
  useEffect(() => {
    if (!pisze) setTekst(wartosc)
  }, [wartosc, pisze])
  return (
    <input
      className="inline-title"
      value={pisze ? tekst : wartosc}
      title="Nazwa kafelka w tej ścieżce — kafelek w bibliotece zostaje bez zmian"
      onFocus={() => {
        setTekst(wartosc)
        setPisze(true)
      }}
      onBlur={() => {
        setPisze(false)
        // spacja na końcu zostaje tylko na czas pisania
        if (tekst.trim() && tekst !== tekst.trim()) onZmien(tekst.trim())
      }}
      onChange={(e) => {
        setTekst(e.target.value)
        onZmien(e.target.value)
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

/** Oko przy stronie kafelka: czy ta strona jest widoczna w teście zakrytym.
 *  Ciche — wyraźniejsze dopiero po najechaniu. Bez onZmien tylko pokazuje stan. */
export function OkoTestu({ widoczna, onZmien }: { widoczna: boolean; onZmien?: (w: boolean) => void }) {
  const opis = widoczna ? 'Widać ją w teście zakrytym (podpowiedź)' : 'W teście zakryta'
  return (
    <button
      type="button"
      className={`oko-testu ${widoczna ? 'widoczna' : ''} ${onZmien ? '' : 'tylko-stan'}`}
      data-oko-testu={widoczna ? 'widoczna' : 'zakryta'}
      title={onZmien ? `${opis} — kliknij, aby ${widoczna ? 'zakryć' : 'pokazać'}` : `${opis}. Zmienisz to w edytorze kafelka (biblioteka)`}
      aria-label={opis}
      aria-pressed={widoczna}
      onClick={(e) => {
        e.stopPropagation()
        onZmien?.(!widoczna)
      }}
    >
      <Icon name={widoczna ? 'odkryj' : 'zakryty'} size={0.8} />
    </button>
  )
}
