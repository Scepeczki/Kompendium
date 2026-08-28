import { useLiveQuery } from 'dexie-react-hooks'
import { db, mainPageName } from '../db'
import { blokiTresci, polaczBloki } from '../akapity'
import { renderMarkdown } from '../markdown'
import { SourceList } from './SourceList'
import {
  kluczWlasnej,
  type BlockType,
  type BlockVersion,
  type Concept,
  type FusionPart,
  type PasekStron,
  type SourceRef,
  type Subpage,
} from '../types'
import { useBlockTypes } from '../blockTypes'
import { useDialogs } from './Dialogs'
import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type GroupPart = FusionPart

/** Przeciąganie pasków stron w obrębie jednego scalonego bloku. */
const PASEK_MIME = 'text/x-komp-pasek'

/** Paski, które wynikają wprost z danych — dopóki nikt nic nie ustawił.
 *
 *  Scalenie ma dawać jednolity tekst, więc kafelek BEZ stron nie zostawia po
 *  sobie żadnego śladu. Tekst przerywa się tylko tam, gdzie zaczyna się
 *  kafelek, który strony ma: tam naprawdę jest z czego wybierać.
 *
 *  Kto zapisuje układ pasków, MUSI wyjść od tej listy, a nie od pustej —
 *  inaczej pierwszy postawiony pasek po cichu kasuje te domyślne. */
export const paskiZDanych = (maStrony: boolean[]): PasekStron[] =>
  maStrony.flatMap((ma, i) =>
    ma ? [{ id: `auto-${i}`, poCzesci: i - 1, czesci: [i] }] : [],
  )

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
  /** Kafelki/wersje/strony podane z zewnątrz. Linia ma je już wczytane dla
   *  całej ścieżki; bez tego każdy scalony blok czytałby trzy całe tabele. */
  zewn?: { concepts: Concept[]; versions: BlockVersion[]; subpages: Subpage[] }
  /** Pole do pisania dla POJEDYNCZEGO składnika. Dzięki niemu scalony blok
   *  bez własnej treści nie jest tylko do czytania: pisze się w nim po każdym
   *  kafelku z osobna, a tekst idzie do tego kafelka w bazie. */
  edytorCzesci?: (
    i: number,
    dane: {
      versionId: string
      subpageId: string | null
      /** Tekst TEGO kawałka składnika (pasek w środku dzieli go na kilka). */
      tresc: string
      biezaca: boolean
      /** Który to kawałek składnika i ile ich w sumie. */
      kawalek: number
      kawalkow: number
      /** Wkłada zapisany kawałek z powrotem w całość składnika i podaje
       *  przy okazji przesunięte paski — tekst i ich pozycje muszą trafić do
       *  ścieżki jednym ruchem, inaczej przez chwilę cięcie stoi gdzie
       *  indziej niż tekst i pole do pisania dostaje nie swoją treść. */
      zloz: (md: string) => { tekst: string; paski?: PasekStron[] }
    },
  ) => React.ReactNode
  /** Paski stron postawione w tym bloku — miejsca, nie właściwości
   *  składników. Zapisują się w ścieżce. */
  paski?: PasekStron[]
  onPaskiStron?: (paski: PasekStron[]) => void
  /** Własny podpis zakładki składnika (też tylko w tej ścieżce). */
  onEtykieta?: (index: number, etykieta: string | undefined) => void
  /** Bez pasków wersji nad składnikami — w Linii wersję i przywracanie
   *  obsługuje menu pod prawym przyciskiem. */
  bezPaskaWersji?: boolean
}

/** Grupa kafelków pokazana jako JEDEN blok: pasek nagłówka z nazwą nadaną
 *  w ścieżce, a w środku same treści kafelków jedna pod drugą — bez ich
 *  własnych ramek i tytułów. W bazie to nadal osobne kafelki. */
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
  bezPaskaWersji,
  paski,
  onPaskiStron,
  onEtykieta,
}: Props) {
  const dlg = useDialogs()
  /** Menu pod prawym przyciskiem na pasku stron (który składnik). */
  /** Menu pod prawym przyciskiem na pasku — który pasek. */
  const [menuPaska, setMenuPaska] = useState<{
    x: number
    y: number
    pasek: string
  } | null>(null)
  /** Przeciąganie zakładek między paskami: który składnik jedzie
   *  i nad którym paskiem wisi. */
  const [ciagnietaCzesc, setCiagnietaCzesc] = useState<number | null>(null)
  /** Czy lista stron w menu paska jest rozwinięta klikiem. */
  const [rozwinieteMenu, setRozwinieteMenu] = useState(false)
  // zamknięte menu ma się otwierać złożone, a nie pamiętać poprzedni raz
  useEffect(() => {
    if (!menuPaska) setRozwinieteMenu(false)
  }, [menuPaska])
  const [celPaska, setCelPaska] = useState<string | null>(null)
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
    // strony należą do wersji, więc filtrujemy po niej, a nie po pojęciu
    const strony = subpages
      .filter((s) => s.versionId === version?.id)
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

  /** Paski postawione w tym bloku.
   *
   *  Dopóki nikt nic nie ustawił, wynikają wprost z danych: scalenie ma dawać
   *  jednolity tekst, więc kafelki BEZ stron nie zostawiają po sobie żadnego
   *  śladu. Tekst przerywa się tylko tam, gdzie zaczyna się kafelek, który
   *  strony ma — bo tam naprawdę jest z czego wybierać.
   *
   *  Pierwsza zmiana (przeciągnięcie, skasowanie, nowy pasek) zapisuje tę
   *  listę na stałe i od tej pory rządzi ustawienie, nie dane. */
  const paskiStron: PasekStron[] =
    paski ?? paskiZDanych(resolved.map((r) => r.strony.length > 0))

  /** Zakładki jednego składnika — do wstawienia w pasek. */
  const zakladki = (i: number) => {
    const r = resolved[i]
    if (!r) return null
    const podpis = parts[i].etykieta ?? mainPageName(r.concept ?? {})
    const klik = (id: string | null) => () => onSubpageChange?.(i, id)
    return (
      <span
        className="group-zakladki"
        key={`z-${i}`}
        draggable={!!onPaskiStron}
        onDragStart={(e) => {
          setCiagnietaCzesc(i)
          e.dataTransfer.setData(PASEK_MIME, String(i))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setCiagnietaCzesc(null)}
        title="Przeciągnij do innego paska"
      >
        {r.strony.length > 0 && onSubpageChange ? (
          <button
            className={`block-page ${r.strona ? '' : 'active'}`}
            onClick={klik(null)}
            title={`Strona główna kafelka „${r.concept?.name ?? ''}"`}
          >
            {podpis}
          </button>
        ) : (
          <span className="page-chip-static">{podpis}</span>
        )}
        {r.strony.map((s) => (
          <button
            key={s.id}
            className={`block-page ${r.strona?.id === s.id ? 'active' : ''}`}
            onClick={klik(s.id)}
          >
            {s.name}
          </button>
        ))}
      </span>
    )
  }

  /** Zapisuje nowy układ pasków. */
  const ustawPaski = (nowe: PasekStron[]) => onPaskiStron?.(nowe)

  /** Pasek stron stojący w danym miejscu. Zostaje nawet pusty — dopóki
   *  go nie skasujesz. Zakładki przeciąga się między paskami. */
  const pasekStron = (pasek: PasekStron) => (
    <div
      key={pasek.id}
      className={`block-pages group-pasek ${celPaska === pasek.id ? 'cel' : ''}`}
      onDragOver={(e) => {
        if (ciagnietaCzesc === null) return
        e.preventDefault()
        setCelPaska(pasek.id)
      }}
      onDragLeave={() => setCelPaska(null)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const czesc = Number(e.dataTransfer.getData(PASEK_MIME))
        setCiagnietaCzesc(null)
        setCelPaska(null)
        if (Number.isNaN(czesc)) return
        ustawPaski(
          paskiStron.map((x) =>
            x.id === pasek.id
              ? { ...x, czesci: [...x.czesci.filter((c) => c !== czesc), czesc] }
              : { ...x, czesci: x.czesci.filter((c) => c !== czesc) },
          ),
        )
      }}
      onContextMenu={(e) => {
        if (!onPaskiStron) return
        e.preventDefault()
        e.stopPropagation()
        setMenuPaska({ x: e.clientX, y: e.clientY, pasek: pasek.id })
      }}
    >
      {pasek.czesci.length === 0 ? (
        <span className="group-pasek-pusty">pusty pasek — przeciągnij tu zakładkę</span>
      ) : (
        pasek.czesci.map((i) => zakladki(i))
      )}
    </div>
  )

  /** Składnik pocięty paskami, które stoją w środku jego tekstu.
   *
   *  Bez takich pasków wychodzi jeden kawałek i wszystko jest jak dawniej.
   *  Z nimi tekst rozpada się na kolejne pola do pisania, a pasek staje
   *  dokładnie w miejscu cięcia. Skasowanie paska zrasta tekst z powrotem
   *  — dlatego „usunąć miejsce na pasek" znaczy „mieć znów jeden ciąg". */
  const kawalkiCzesci = (i: number) => {
    const tresc = resolved[i]?.tresc ?? ''
    const wewn = paskiStron
      .filter((x) => x.poCzesci === i && x.poAkapicie !== undefined)
      .sort((a, b) => (a.poAkapicie ?? 0) - (b.poAkapicie ?? 0))
    if (wewn.length === 0) {
      return [
        { tekst: tresc, pasek: null, k: 0, ile: 1, zloz: (md: string) => ({ tekst: md }) },
      ]
    }
    const bloki = blokiTresci(tresc)
    const ciecia = wewn.map((x) => Math.max(0, Math.min(bloki.length, x.poAkapicie ?? 0)))
    const granice = [0, ...ciecia, bloki.length]
    const teksty = granice
      .slice(0, -1)
      .map((od, k) => polaczBloki(bloki.slice(od, granice[k + 1])))
    /** Po zapisaniu kawałka paski dostają nowe numery akapitów — liczone od
     *  nowa z długości kawałków. Dzięki temu dopisanie zdania nie przesuwa
     *  paska o akapit w dół. */
    const zloz = (k: number) => (md: string) => {
      const nowe = teksty.map((t, j) => (j === k ? md : t))
      const dlugosci = nowe.map((t) => blokiTresci(t).length)
      let suma = 0
      const poprawki = new Map<string, number>()
      wewn.forEach((x, j) => {
        suma += dlugosci[j]
        poprawki.set(x.id, suma)
      })
      return {
        tekst: polaczBloki(nowe),
        paski: paskiStron.map((x) =>
          poprawki.has(x.id) ? { ...x, poAkapicie: poprawki.get(x.id) } : x,
        ),
      }
    }
    return teksty.map((tekst, k) => ({
      tekst,
      pasek: wewn[k] ?? null,
      k,
      ile: teksty.length,
      zloz: zloz(k),
    }))
  }

  /** Miejsce między składnikami.
   *
   *  Nie ma tu żadnego przycisku „dodaj pasek": scalony blok ma wyglądać jak
   *  jeden tekst, a nie jak formularz z okienkami. Pasek stawia się prawym
   *  przyciskiem w dowolnym miejscu treści. Bez paska zostaje sam odstęp —
   *  dokładnie taki, jak między dwoma akapitami — a na początku i na końcu
   *  bloku nie ma nawet tego. */
  const przerwa = (poCzesci: number) => {
    const tutejsze = paskiStron.filter(
      (x) => x.poCzesci === poCzesci && x.poAkapicie === undefined,
    )
    const miedzySkladnikami = poCzesci >= 0 && poCzesci < parts.length - 1
    if (tutejsze.length === 0 && !miedzySkladnikami) return null
    return (
      <div
        className={`group-przerwa ${tutejsze.length === 0 ? 'group-przerwa-pusta' : ''}`}
        key={`p-${poCzesci}`}
      >
        {tutejsze.map((x) => pasekStron(x))}
      </div>
    )
  }

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
          {przerwa(-1)}
          {resolved.map((r, i) => (
            <Fragment key={`${parts[i].conceptId}-${i}`}>
              <div className="group-part">
              {/* Pasek wersji tylko wtedy, gdy naprawdę jest z czego wybierać.
                  Samotne „wr.1" nad każdym składnikiem nic nie mówiło, a
                  rozbijało scalony tekst na kawałki przy samym czytaniu. */}
              {r.version && !bezPaskaWersji && r.own.length > 1 && (
                <div className="block-pick block-pick-version">
                  {r.own.length > 1 && onVersionChange ? (
                    <select
                      className="block-pick-select"
                      value={r.version.id}
                      title={
                        pickHint ??
                        `Wersja kafelka „${r.concept?.name ?? ''}" w tej grupie`
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
              {kawalkiCzesci(i).map(({ tekst, pasek, k, ile, zloz }) => (
                <Fragment key={`k${k}`}>
                  {edytorCzesci && r.concept && r.version ? (
                    edytorCzesci(i, {
                      versionId: r.version.id,
                      subpageId: r.strona?.id ?? null,
                      tresc: tekst,
                      biezaca: r.version.id === r.concept.currentVersionId,
                      kawalek: k,
                      kawalkow: ile,
                      zloz,
                    })
                  ) : (
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(r.concept ? tekst : '(usunięty kafelek)'),
                      }}
                    />
                  )}
                  {/* pasek postawiony w środku tekstu — rozcina go tutaj */}
                  {pasek && pasekStron(pasek)}
                </Fragment>
              ))}
            </div>
              {/* przerwa pod składnikiem: tu stawia się pasek stron */}
              {przerwa(i)}
            </Fragment>
          ))}
        </div>
        )}

        <SourceList refs={refs} onJump={onJumpToSource} />
      </div>

      {/* Menu paska stron. Wszystko tutaj dotyczy TEJ ścieżki — nazwa strony
          w bibliotece i sam kafelek zostają nietknięte. */}
      {menuPaska &&
        createPortal(
        <>
          <div className="tree-menu-cien" onClick={() => setMenuPaska(null)} />
          <div
            className="tree-menu"
            style={{ left: menuPaska.x, top: menuPaska.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="tree-menu-where">Pasek stron (tylko w tej ścieżce)</div>
            {/* Zakładki wpadają tu przeciągnięciem, ale celowanie myszą to
                nie jedyna droga: ta sama lista, rozwijana, z każdą stroną
                scalonych kafelków. */}
            {(() => {
              const pasek = paskiStron.find((x) => x.id === menuPaska.pasek)
              if (!pasek) return null
              // nazwa kafelka jest nagłówkiem, a pod nim jego strony —
              // „Treść" samo w sobie nic nie mówi, gdy kafelków jest kilka
              const pozycje = resolved.flatMap((r, i) => {
                const kafelek = parts[i].etykieta ?? r.concept?.name ?? '(kafelek)'
                return [
                  { i, id: null as string | null, nazwa: mainPageName(r.concept ?? {}), kafelek },
                  ...r.strony.map((st) => ({
                    i,
                    id: st.id as string | null,
                    nazwa: st.name,
                    kafelek,
                  })),
                ]
              })
              if (pozycje.length === 0) return null
              return (
                <>
                  <div
                    className={`tree-menu-podmenu ${rozwinieteMenu ? 'otwarte' : ''}`}
                  >
                    <button
                      className="tree-menu-item tree-menu-rozwija"
                      type="button"
                      aria-expanded={rozwinieteMenu}
                      onClick={() => setRozwinieteMenu((r) => !r)}
                    >
                      <span>Wstaw zakładkę</span>
                      <span className="tree-menu-strzalka">›</span>
                    </button>
                    <div className="tree-menu tree-menu-boczne">
                      {pozycje.map((poz, nr) => {
                        const tutaj = pasek.czesci.includes(poz.i)
                        const teraz =
                          tutaj && (resolved[poz.i]?.strona?.id ?? null) === poz.id
                        const pierwsza = pozycje[nr - 1]?.i !== poz.i
                        return (
                          <Fragment key={`${poz.i}-${poz.id ?? 'gl'}`}>
                          {pierwsza && (
                            <div className="tree-menu-where">{poz.kafelek}</div>
                          )}
                          <button
                            className={`tree-menu-item ${teraz ? 'wybrany' : ''}`}
                            onClick={() => {
                              setMenuPaska(null)
                              // składnik mieszka w jednym pasku — przenosimy,
                              // a nie dublujemy
                              ustawPaski(
                                paskiStron.map((x) =>
                                  x.id === pasek.id
                                    ? {
                                        ...x,
                                        czesci: tutaj ? x.czesci : [...x.czesci, poz.i],
                                      }
                                    : { ...x, czesci: x.czesci.filter((c) => c !== poz.i) },
                                ),
                              )
                              onSubpageChange?.(poz.i, poz.id)
                            }}
                          >
                            {teraz ? '• ' : '   '}
                            {poz.nazwa}
                          </button>
                          </Fragment>
                        )
                      })}
                    </div>
                  </div>
                  <div className="tree-menu-sep" />
                </>
              )
            })()}
            <button
              className="tree-menu-item tree-menu-groznie"
              onClick={() => {
                const id = menuPaska.pasek
                setMenuPaska(null)
                // skasowanie zamyka przerwę — tekst znów jest ciągły
                ustawPaski(paskiStron.filter((x) => x.id !== id))
              }}
            >
              🗑 Usuń ten pasek
            </button>
            {(paskiStron.find((x) => x.id === menuPaska.pasek)?.czesci.length ?? 0) > 0 && (
              <button
                className="tree-menu-item"
                onClick={() => {
                  const id = menuPaska.pasek
                  setMenuPaska(null)
                  // zakładki wracają „do tekstu" — pasek zostaje pusty
                  ustawPaski(
                    paskiStron.map((x) => (x.id === id ? { ...x, czesci: [] } : x)),
                  )
                }}
              >
                ⇱ Opróżnij pasek
              </button>
            )}
            <div className="tree-menu-sep" />
            <button
              className="tree-menu-item"
              onClick={async () => {
                const pasek = paskiStron.find((x) => x.id === menuPaska.pasek)
                setMenuPaska(null)
                const i = pasek?.czesci[0]
                if (i === undefined) return
                const teraz =
                  parts[i].etykieta ?? mainPageName(resolved[i]?.concept ?? {})
                const nowa = await dlg.prompt({
                  title: 'Podpis zakładki w tej ścieżce',
                  message: 'Puste pole przywraca nazwę z kafelka.',
                  value: teraz,
                  allowEmpty: true,
                })
                if (nowa === null) return
                onEtykieta?.(i, nowa.trim() || undefined)
              }}
            >
              ✎ Zmień podpis pierwszej zakładki…
            </button>
          </div>
        </>,
          document.body,
        )}
    </section>
  )
}
