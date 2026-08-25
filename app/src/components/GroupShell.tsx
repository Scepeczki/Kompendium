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
import { useDialogs } from './Dialogs'
import { useState } from 'react'
import { createPortal } from 'react-dom'

export type GroupPart = FusionPart

/** Przeciąganie pasków stron w obrębie jednego scalonego bloku. */
const PASEK_MIME = 'text/x-komp-pasek'

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
      tresc: string
      biezaca: boolean
    },
  ) => React.ReactNode
  /** Gdzie stoją paski stron („TREŚĆ", „Dowód"…) w tym scalonym bloku.
   *  Domyślnie przy każdym składniku; „jeden" zbiera je w rząd dla całości,
   *  „brak" chowa zupełnie — wtedy części czytają się jak jeden tekst. */
  paski?: 'kazdy' | 'jeden' | 'brak'
  onPaskiChange?: (p: 'kazdy' | 'jeden' | 'brak') => void
  /** Zmiana ustawień POJEDYNCZEGO paska (schowanie, doczepienie, podpis,
   *  schowane strony) — wszystko w obrębie tej ścieżki. */
  onPasekCzesci?: (index: number, zmiana: Partial<FusionPart>) => void
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
  paski = 'kazdy',
  onPaskiChange,
  onPasekCzesci,
}: Props) {
  const dlg = useDialogs()
  /** Menu pod prawym przyciskiem na pasku stron (który składnik). */
  const [menuPaska, setMenuPaska] = useState<{
    x: number
    y: number
    i: number
    /** Która zakładka była pod kursorem — do „schowaj tę stronę". */
    strona?: string
  } | null>(null)
  /** Przeciąganie pasków: który jedzie i nad którym wisi. */
  const [przeciagany, setPrzeciagany] = useState<number | null>(null)
  const [celPaska, setCelPaska] = useState<number | null>(null)
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

  /** Czy pasek składnika jest schowany (stare ustawienie „wszystkie" nadal
   *  respektujemy, żeby nikomu nic nie wyskoczyło z powrotem). */
  const ukryty = (i: number) => parts[i]?.pasekUkryty ?? paski === 'brak'

  /** Numery składników, których paski doczepiono do paska `i`. */
  const doczepione = (i: number) =>
    parts.map((cz, n) => (cz.pasekPrzy === i && !ukryty(n) ? n : -1)).filter((n) => n >= 0)

  /** Zakładki jednego składnika — bez własnej ramki, do wstawienia w pasek. */
  const zakladki = (i: number) => {
    const r = resolved[i]
    if (!r) return null
    const schowane = parts[i].ukryteStrony ?? []
    const podpis = parts[i].etykieta ?? mainPageName(r.concept ?? {})
    const klik = (id: string | null) => () => onSubpageChange?.(i, id)
    return (
      <span className="group-zakladki" key={`z-${i}`}>
        {!schowane.includes('glowna') &&
          (r.strony.length > 0 && onSubpageChange ? (
            <button
              className={`block-page ${r.strona ? '' : 'active'}`}
              data-strona="glowna"
              data-czesc={i}
              title={`Strona główna kafelka „${r.concept?.name ?? ''}"`}
              onClick={klik(null)}
            >
              {podpis}
            </button>
          ) : (
            <span className="page-chip-static" data-strona="glowna" data-czesc={i}>
              {podpis}
            </span>
          ))}
        {r.strony
          .filter((s) => !schowane.includes(s.id))
          .map((s) => (
            <button
              key={s.id}
              className={`block-page ${r.strona?.id === s.id ? 'active' : ''}`}
              data-strona={s.id}
              data-czesc={i}
              onClick={klik(s.id)}
            >
              {s.name}
            </button>
          ))}
      </span>
    )
  }

  /** Pasek stron składnika. Można go przeciągnąć na inny pasek (wtedy
   *  zakładki stają w jednym rzędzie) albo z powrotem na swoje miejsce.
   *  Prawy przycisk daje osobno: schowaj cały pasek, schowaj tę stronę,
   *  zmień podpis. Wszystko zostaje W TEJ ŚCIEŻCE. */
  const pasekStron = (i: number) => {
    if (!resolved[i] || ukryty(i) || parts[i].pasekPrzy !== undefined) return null
    const razem = [i, ...doczepione(i)]
    return (
      <div
        className={`block-pages group-part-pages ${przeciagany === i ? 'ciagniety' : ''} ${celPaska === i ? 'cel' : ''}`}
        draggable={!!onPasekCzesci}
        onDragStart={(e) => {
          setPrzeciagany(i)
          e.dataTransfer.setData(PASEK_MIME, String(i))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          setPrzeciagany(null)
          setCelPaska(null)
        }}
        onDragOver={(e) => {
          if (przeciagany === null || przeciagany === i) return
          e.preventDefault()
          setCelPaska(i)
        }}
        onDragLeave={() => setCelPaska(null)}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const skad = Number(e.dataTransfer.getData(PASEK_MIME))
          setPrzeciagany(null)
          setCelPaska(null)
          if (Number.isNaN(skad) || skad === i) return
          onPasekCzesci?.(skad, { pasekPrzy: i })
        }}
        onContextMenu={(e) => {
          if (!onPasekCzesci) return
          e.preventDefault()
          e.stopPropagation()
          const el = (e.target as HTMLElement).closest<HTMLElement>('[data-strona]')
          setMenuPaska({
            x: e.clientX,
            y: e.clientY,
            i: Number(el?.dataset.czesc ?? i),
            strona: el?.dataset.strona,
          })
        }}
      >
        {razem.map((n) => zakladki(n))}
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
          {/* Gdy paski są schowane, nie ma czego kliknąć prawym, żeby je
              odzyskać. Stąd uchwyt: niewidoczny, dopóki nie najedziesz. */}
          {paski === 'brak' && onPaskiChange && (
            <button
              className="group-paski-uchwyt"
              title="Paski stron (prawy przycisk)"
              onClick={(e) => setMenuPaska({ x: e.clientX, y: e.clientY, i: 0 })}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenuPaska({ x: e.clientX, y: e.clientY, i: 0 })
              }}
            >
              ⋯
            </button>
          )}
          {resolved.map((r, i) => (
            <div key={`${parts[i].conceptId}-${i}`} className="group-part">
              {paski === 'kazdy' && pasekStron(i)}
              {r.version && !bezPaskaWersji && (
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
                    __html: renderMarkdown(r.concept ? r.tresc : '(usunięty kafelek)'),
                  }}
                />
              )}
            </div>
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
            <button
              className="tree-menu-item"
              onClick={() => {
                const i = menuPaska.i
                setMenuPaska(null)
                onPasekCzesci?.(i, { pasekUkryty: true })
              }}
            >
              🚫 Schowaj ten pasek
            </button>
            {menuPaska.strona && (
              <button
                className="tree-menu-item"
                onClick={() => {
                  const { i, strona } = menuPaska
                  setMenuPaska(null)
                  if (!strona) return
                  const teraz = parts[i].ukryteStrony ?? []
                  onPasekCzesci?.(i, { ukryteStrony: [...teraz, strona] })
                }}
              >
                ✕ Schowaj tę stronę
              </button>
            )}
            {parts[menuPaska.i]?.pasekPrzy !== undefined && (
              <button
                className="tree-menu-item"
                onClick={() => {
                  const i = menuPaska.i
                  setMenuPaska(null)
                  onPasekCzesci?.(i, { pasekPrzy: undefined })
                }}
              >
                ⇱ Odczep na własny wiersz
              </button>
            )}
            <div className="tree-menu-sep" />
            <button
              className="tree-menu-item"
              onClick={async () => {
                const i = menuPaska.i
                setMenuPaska(null)
                const teraz =
                  parts[i].etykieta ?? mainPageName(resolved[i]?.concept ?? {})
                const nowa = await dlg.prompt({
                  title: 'Podpis paska w tej ścieżce',
                  message: 'Puste pole przywraca nazwę z kafelka.',
                  value: teraz,
                  allowEmpty: true,
                })
                if (nowa === null) return
                onPasekCzesci?.(i, { etykieta: nowa.trim() || undefined })
              }}
            >
              ✎ Zmień podpis…
            </button>
          </div>
        </>,
          document.body,
        )}
    </section>
  )
}
