import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BlockTypes } from '../blockTypes'
import { Icon } from './Icon'
import { POZIOM_MAX, type Concept, type PathNode, type PoziomRozdzialu } from '../types'

export interface OutlineItem {
  /** id elementu nagłówka w dokumencie (do przewijania). */
  domId: string
  /** id węzła ścieżki — po nim przestawiamy kolejność przeciąganiem. */
  nodeId: string
  text: string
  /** 1–6 = rozdział i podrozdziały; 'kafelek' = pozycja pod rozdziałem. */
  level: PoziomRozdzialu | 'kafelek'
  /** Kolor rodzaju — żeby definicje odróżniały się od twierdzeń wzrokiem. */
  barwa?: string
  /** Kuleczka bez wypełnienia: komentarz, który nie wchodzi do skryptu. */
  pusta?: boolean
}

/** Spis ścieżki: rozdziały, a pod nimi wszystko, co w nich stoi — definicje,
 *  twierdzenia, przykłady i notatki. Wspólny dla Linii i Skryptu. */
export function pozycjeSpisu(
  nodes: PathNode[],
  klocek: (id: string) => Concept | undefined,
  typy: BlockTypes,
): OutlineItem[] {
  return nodes.map((n) => {
    if (n.kind === 'heading') {
      return { domId: outlineId(n.id), nodeId: n.id, text: n.text, level: n.level }
    }
    if (n.kind === 'text' || n.kind === 'comment') {
      // notatka nie ma nazwy — bierzemy jej pierwszą linijkę, żeby dało się
      // ją poznać, a gdy jest pusta, zostaje samo słowo
      const pierwsza = (n.text ?? '').split('\n').find((w) => w.trim() !== '')?.trim()
      return {
        domId: n.id,
        nodeId: n.id,
        text: pierwsza ? pierwsza.slice(0, 60) : 'Notatka',
        level: 'kafelek' as const,
        pusta: n.kind === 'comment',
      }
    }
    if (n.kind === 'fusion') {
      return {
        domId: n.id,
        nodeId: n.id,
        text: n.name,
        level: 'kafelek' as const,
        barwa: n.type ? typy.def(n.type).color : undefined,
      }
    }
    const c = klocek(n.conceptId)
    return {
      domId: n.id,
      nodeId: n.id,
      text: n.nazwa ?? c?.name ?? '(usunięty kafelek)',
      level: 'kafelek' as const,
      barwa: c ? typy.def(c.type).color : undefined,
    }
  })
}

/** Przeciąganie pozycji spisu — własny typ, żeby nie mieszać się z kafelkami
 *  ciągniętymi z listy po lewej. */
const MIME = 'text/x-komp-spis'

/** Własna wielkość rozdziału — CSS przelicza ją tak samo jak domyślną. */
export const stylRozdzialu = (rozmiar?: number) =>
  rozmiar ? ({ '--rozmiar': `${rozmiar}px` } as React.CSSProperties) : undefined

/** Własna wielkość tekstu jednego kafelka: nadpisuje wartość z Ustawień tylko w nim. */
export const stylTekstu = (rozmiar?: number) =>
  rozmiar ? ({ '--tekst-kafelka': `${rozmiar}px` } as React.CSSProperties) : undefined

/** Identyfikator elementu nagłówka — wspólny dla spisu i samego dokumentu. */
export const outlineId = (nodeId: string) => `outline-${nodeId}`

/** Element, do którego prowadzi pozycja spisu. Rozdziały mają własne `id`,
 *  a kafelki znajdujemy po znaczniku segmentu — nie mają nagłówka w treści. */
const znajdz = (domId: string): HTMLElement | null =>
  document.getElementById(domId) ??
  (document.querySelector(`[data-seg="${domId}"]`) as HTMLElement | null)

/** Najbliższy przewijany rodzic elementu (widok Skryptu albo Linii). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

interface Props {
  items: OutlineItem[]
  /** Przestawienie kolejności przeciąganiem w spisie. Bez tego spis jest
   *  tylko do czytania (tak działa Skrypt). */
  onMove?: (nodeId: string, afterId: string | null, beforeId: string | null) => void
  /** Kafelek, przy którym właśnie się pracuje — w spisie jest wyróżniony. */
  biezacy?: string | null
  /** Zmiana ważności rozdziału. Bez tego strzałek nie ma (tak działa Skrypt). */
  onPoziom?: (nodeId: string, level: PoziomRozdzialu) => void
  /** Prawy przycisk na rozdziale: dokładny poziom i własna wielkość. */
  onMenu?: (e: React.MouseEvent, nodeId: string) => void
}

/** Kafelki przed pierwszym rozdziałem zwijają się jak rozdział o tym id. */
const POCZATEK = '__poczatek'

const SZEROKOSC = 'ui.outlineWidth'
const RODZAJ = 'ui.outlineRodzaj'
const MIN_SZER = 160
const MAX_SZER = 560

/** Spis treści ścieżki (jak konspekt w Google Docs): lista rozdziałów po
 *  lewej, klik przewija do miejsca, bieżący rozdział jest podświetlony.
 *  Panel można schować — wybór jest zapamiętywany. */
export function Outline({ items, onMove, biezacy, onPoziom, onMenu }: Props) {
  /** Dwa spisy w jednym miejscu. Ogólny to same rozdziały i podrozdziały,
   *  szczegółowy dokłada skrótowo każdy kafelek z jego rodzajem. */
  const [rodzaj, setRodzaj] = useState<'ogolny' | 'szczegolowy'>(() =>
    localStorage.getItem(RODZAJ) === 'szczegolowy' ? 'szczegolowy' : 'ogolny',
  )
  useEffect(() => {
    localStorage.setItem(RODZAJ, rodzaj)
  }, [rodzaj])
  const szczegolowy = rodzaj === 'szczegolowy'

  const [open, setOpen] = useState(() => {
    const zapamietane = localStorage.getItem('ui.outline')
    if (zapamietane === '0') return false
    if (zapamietane === '1') return true
    // Pierwszy raz na tym urządzeniu. Na dużym ekranie spis stoi obok treści
    // i pomaga; na telefonie jest szufladą, która zasłania to, co się czyta —
    // więc tam startuje schowany i wyjeżdża dopiero na życzenie.
    return !window.matchMedia('(max-width: 760px)').matches
  })
  useEffect(() => {
    localStorage.setItem('ui.outline', open ? '1' : '0')
  }, [open])

  /** Szerokość spisu — długie nazwy twierdzeń nie mieszczą się w 210 px,
   *  a przy krótkich szkoda miejsca na tekst. Wybór zostaje zapamiętany. */
  const [szer, setSzer] = useState(() => {
    const z = Number(localStorage.getItem(SZEROKOSC))
    // 210 to dawna szerokość domyślna, zapamiętana także bez przeciągania
    return z >= MIN_SZER && z <= MAX_SZER && z !== 210 ? z : 222
  })
  // Liczymy PRZESUNIĘCIE myszy, a nie jej pozycję na ekranie: spis nie zaczyna
  // się przy krawędzi okna (po lewej stoi lista kafelków), więc sama pozycja
  // dawałaby szerokość powiększoną o wszystko, co jest przed spisem.
  const ciagnieRef = useRef<{ x: number; szer: number } | null>(null)
  useEffect(() => {
    const rusz = (e: MouseEvent) => {
      const start = ciagnieRef.current
      if (!start) return
      e.preventDefault()
      const chce = start.szer + (e.clientX - start.x)
      setSzer(Math.min(MAX_SZER, Math.max(MIN_SZER, chce)))
    }
    const puszcz = () => {
      if (!ciagnieRef.current) return
      ciagnieRef.current = null
      document.body.classList.remove('ciagne-szerokosc')
    }
    window.addEventListener('mousemove', rusz)
    window.addEventListener('mouseup', puszcz)
    return () => {
      window.removeEventListener('mousemove', rusz)
      window.removeEventListener('mouseup', puszcz)
    }
  }, [])
  useEffect(() => {
    localStorage.setItem(SZEROKOSC, String(szer))
  }, [szer])

  /** Przeciąganie w spisie: co jedzie i gdzie wyląduje.
   *  `pos` liczymy jak w Linii — górna połowa wiersza znaczy „przed", dolna
   *  „po" — żeby jedna szczelina miała jeden opis. */
  const ciagniety = useRef<string | null>(null)
  const [wskaz, setWskaz] = useState<{ nodeId: string; pos: 'before' | 'after' } | null>(
    null,
  )

  const [active, setActive] = useState<string | null>(null)
  const visible = useRef(new Set<string>())

  /** Rozwinięte rozdziały spisu szczegółowego. Reszta to rząd kuleczek. */
  const [otwarte, setOtwarte] = useState<Set<string>>(() => new Set())
  const lista = useRef<HTMLUListElement>(null)
  /** Gdzie stały kuleczki i wiersze przed rozwinięciem: stąd ruszają. */
  const miejsca = useRef<Map<string, DOMRect> | null>(null)
  const zapamietajMiejsca = () => {
    const el = lista.current
    if (!el) return
    miejsca.current = new Map(
      [...el.querySelectorAll<HTMLElement>('[data-ruch]')].map((x) => [
        x.dataset.ruch as string,
        x.getBoundingClientRect(),
      ]),
    )
  }
  // Kuleczka z rzędu i ta z listy to dwa różne miejsca w dokumencie, a ma
  // wyglądać jak jedna rozjeżdżająca się: rysujemy ją najpierw tam, gdzie
  // była, i puszczamy na nowe miejsce.
  useLayoutEffect(() => {
    const stare = miejsca.current
    miejsca.current = null
    if (!stare || !lista.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const el of lista.current.querySelectorAll<HTMLElement>('[data-ruch]')) {
      const a = stare.get(el.dataset.ruch as string)
      if (!a) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
        continue
      }
      const b = el.getBoundingClientRect()
      if (a.left === b.left && a.top === b.top) continue
      el.animate(
        [
          { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` },
          { transform: 'none' },
        ],
        { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
      )
    }
  }, [otwarte])

  /** Rozdział otwarty przez samo czytanie: zamyka się, gdy czytanie pójdzie dalej.
   *  Otwarte ręcznie zostają, dopóki się ich ręcznie nie zamknie. */
  const samOtwarty = useRef<string | null>(null)
  useEffect(() => {
    if (!active?.startsWith(outlineId(''))) return
    const id = active.slice(outlineId('').length)
    const stary = samOtwarty.current
    if (stary === id) return
    samOtwarty.current = id
    zapamietajMiejsca()
    setOtwarte((s) => {
      const n = new Set(s)
      if (stary) n.delete(stary)
      n.add(id)
      return n
    })
  }, [active])

  const przelacz = (id: string) => {
    if (samOtwarty.current === id) samOtwarty.current = null
    zapamietajMiejsca()
    setOtwarte((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  }

  // Podświetlenie bieżącego rozdziału: śledzimy, które nagłówki są w oknie,
  // i bierzemy pierwszy z nich w kolejności dokumentu.
  useEffect(() => {
    if (!open || items.length === 0) return
    visible.current.clear()
    const anchor = znajdz(items[0].domId)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.current.add(e.target.id)
          else visible.current.delete(e.target.id)
        }
        const first = items.find((i) => visible.current.has(i.domId))
        if (first) setActive(first.domId)
      },
      {
        // liczy się górna część widoku — tam, gdzie właśnie czytamy
        root: anchor ? scrollParent(anchor) : null,
        rootMargin: '0px 0px -65% 0px',
        threshold: 0,
      },
    )
    // podświetlamy tylko rozdziały — obserwowanie każdego kafelka w długiej
    // ścieżce byłoby setkami obserwacji bez pożytku
    for (const it of items) {
      if (it.level === 'kafelek') continue
      const el = znajdz(it.domId)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [open, items])

  /** Zatrzymanie trwającego skoku — w danej chwili może być tylko jeden. */
  const przerwijSkok = useRef<(() => void) | null>(null)
  useEffect(() => () => przerwijSkok.current?.(), [])

  /** Przewija do nagłówka i przez chwilę trzyma go na miejscu: treść nad nim
   *  (wzory, podglądy stron) dorasta już po przewinięciu i zepchnęłaby cel
   *  w dół. Przypinanie kończy się, gdy użytkownik sam przewinie. */
  /** Na telefonie spis jest szufladą na wierzchu treści: po wybraniu miejsca
   *  ma zejść z drogi, tak samo jak lista kafelków. Na dużym ekranie stoi
   *  obok i nikomu nie przeszkadza, więc zostaje otwarty. */
  const waskoRef = useRef(false)
  waskoRef.current =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches

  const goTo = (domId: string) => {
    if (waskoRef.current) setOpen(false)
    // Poprzedni skok kończymy natychmiast. Bez tego przeskakiwanie po spisie
    // zostawiało za sobą kilka dociągań naraz — każde do innego kafelka —
    // a widok latał między nimi jak oszalały, dopóki wszystkie nie wygasły.
    przerwijSkok.current?.()
    const first = znajdz(domId)
    if (!first) return
    const scroller = scrollParent(first)
    if (!scroller) {
      first.scrollIntoView({ block: 'start' })
      return
    }
    // Znacznik „ktoś tu przewija celowo". Widok ścieżki sam dociąga zapamiętane
    // miejsce czytania i te dwa przewijania szarpały ekranem w górę i w dół,
    // dopóki jedno się nie skończyło. Ten skok jest ważniejszy — właśnie
    // kliknąłeś, gdzie chcesz być.
    scroller.dataset.skok = '1'
    let stop = false
    const koniec = () => {
      stop = true
      delete scroller.dataset.skok
      scroller.removeEventListener('wheel', koniec)
      scroller.removeEventListener('touchstart', koniec)
      if (przerwijSkok.current === koniec) przerwijSkok.current = null
    }
    przerwijSkok.current = koniec
    scroller.addEventListener('wheel', koniec, { passive: true })
    scroller.addEventListener('touchstart', koniec, { passive: true })

    /** Zwraca, o ile jeszcze cel jest nie na miejscu. */
    const align = () => {
      const el = znajdz(domId)
      if (!el) return 0
      const delta =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12
      if (Math.abs(delta) > 2) scroller.scrollTop += delta
      return Math.abs(delta)
    }
    align()

    // Kończymy, gdy treść nad celem przestanie dorastać — trzy spokojne
    // sprawdzenia z rzędu. Bez tego poprawialiśmy przez pełne półtorej sekundy,
    // choć wszystko stało już od dawna w miejscu.
    let spokoj = 0
    const until = performance.now() + 1500
    const tick = () => {
      if (stop || performance.now() > until) return koniec()
      const d = align()
      if (d <= 2) {
        if (++spokoj >= 3) return koniec()
      } else spokoj = 0
      window.setTimeout(tick, 100)
    }
    window.setTimeout(tick, 60)
  }

  /** Sąsiedzi wybranej szczeliny — liczone na pełnej liście pozycji. */
  const upusc = (i: number, pos: 'before' | 'after') => {
    const id = ciagniety.current
    ciagniety.current = null
    setWskaz(null)
    if (!id || !onMove) return
    const afterId = pos === 'before' ? (items[i - 1]?.nodeId ?? null) : items[i].nodeId
    const beforeId = pos === 'before' ? items[i].nodeId : (items[i + 1]?.nodeId ?? null)
    if (id === afterId || id === beforeId) return
    onMove(id, afterId, beforeId)
  }

  /** Wspólne zachowanie wiersza jako celu upuszczenia. */
  const cel = (it: OutlineItem, i: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!ciagniety.current) return
      e.preventDefault()
      e.stopPropagation()
      const r = e.currentTarget.getBoundingClientRect()
      setWskaz({
        nodeId: it.nodeId,
        pos: e.clientY - r.top < r.height / 2 ? 'before' : 'after',
      })
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const r = e.currentTarget.getBoundingClientRect()
      upusc(i, e.clientY - r.top < r.height / 2 ? 'before' : 'after')
    },
  })

  /** Klasa rysująca kreskę „tu wyląduje" — ta sama, co w Linii. */
  const kreska = (nodeId: string) =>
    wskaz?.nodeId !== nodeId ? '' : wskaz.pos === 'before' ? 'drop-before' : 'drop-after'

  if (items.length === 0) return null

  /** Kafelek stoi w spisie o stopień głębiej niż rozdział, do którego należy. */
  const wciecia: number[] = []
  const wlasciciele: string[] = []
  const kafelkiRozdzialu = new Map<string, OutlineItem[]>()
  let poziom = 0
  let wlasciciel = POCZATEK
  for (const it of items) {
    if (it.level !== 'kafelek') {
      poziom = it.level
      wlasciciel = it.nodeId
    } else {
      kafelkiRozdzialu.set(wlasciciel, [...(kafelkiRozdzialu.get(wlasciciel) ?? []), it])
    }
    wciecia.push(poziom)
    wlasciciele.push(wlasciciel)
  }
  const saRozdzialy = items.some((it) => it.level !== 'kafelek')
  // bez rozdziałów nie ma czego zwijać: kafelki stoją wprost na liście
  const zwiniety = (id: string) => saRozdzialy && !otwarte.has(id)

  const kropka = (it: OutlineItem) => (
    <span
      className={`outline-kropka ${it.pusta ? 'pusta' : ''}`}
      data-ruch={`k-${it.nodeId}`}
      style={it.barwa ? ({ '--barwa': it.barwa } as React.CSSProperties) : undefined}
    />
  )

  /** Znacznik rozwijania — tylko tam, gdzie jest co rozwijać. */
  const strzalka = (id: string) => (
    <button
      className={`outline-chev ${zwiniety(id) ? '' : 'open'}`}
      title={zwiniety(id) ? 'Rozwiń kafelki' : 'Zwiń kafelki'}
      aria-expanded={!zwiniety(id)}
      onClick={() => przelacz(id)}
    >
      ▸
    </button>
  )

  /** Zwinięty rozdział: kuleczki pod nazwą. Miejsce na każdą kurczy się samo,
   *  więc przy wielu kafelkach zachodzą na siebie i nigdy nie łamią wiersza. */
  const rzadKropek = (id: string, wciecie: number) =>
    zwiniety(id) &&
    kafelkiRozdzialu.has(id) && (
      <button
        className="outline-kropki"
        style={{ paddingLeft: wciecie * 12 }}
        title="Rozwiń kafelki"
        onClick={() => przelacz(id)}
      >
        {kafelkiRozdzialu.get(id)?.map((it) => (
          <span key={it.nodeId} className="outline-miejsce" title={it.text}>
            {kropka(it)}
          </span>
        ))}
      </button>
    )

  if (!open) {
    return (
      <button
        className="outline-reopen"
        title="Pokaż spis treści"
        onClick={() => setOpen(true)}
      >
        ☰
      </button>
    )
  }

  return (
    <nav
      className={`outline ${szczegolowy ? 'outline-szczegolowy' : 'outline-ogolny'}`}
      style={{ width: szer }}
      onDragEnd={() => {
        ciagniety.current = null
        setWskaz(null)
      }}
      onDragLeave={(e) => {
        // wyjście poza cały spis, nie tylko z wiersza na wiersz
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setWskaz(null)
      }}
    >
      <div
        className="outline-uchwyt"
        title="Przeciągnij, aby zmienić szerokość spisu"
        onMouseDown={(e) => {
          e.preventDefault()
          ciagnieRef.current = { x: e.clientX, szer }
          document.body.classList.add('ciagne-szerokosc')
        }}
        onDoubleClick={() => setSzer(222)}
      />
      <div className="outline-head">
        <span className="outline-title">Spis treści</span>
        <div className="outline-rodzaj" role="group" aria-label="Rodzaj spisu">
          <button
            className={szczegolowy ? '' : 'wybrany'}
            title="Ogólny: same rozdziały i podrozdziały"
            aria-label="Spis ogólny"
            aria-pressed={!szczegolowy}
            onClick={() => setRodzaj('ogolny')}
          >
            <Icon name="spisOgolny" size={1.1} />
          </button>
          <button
            className={szczegolowy ? 'wybrany' : ''}
            title="Szczegółowy: rozdziały i skrótowo wszystkie kafelki"
            aria-label="Spis szczegółowy"
            aria-pressed={szczegolowy}
            onClick={() => setRodzaj('szczegolowy')}
          >
            <Icon name="spisSzczegolowy" size={1.1} />
          </button>
        </div>
        <button
          className="folder-action"
          title="Schowaj spis treści"
          onClick={() => setOpen(false)}
        >
          «
        </button>
      </div>
      {!szczegolowy && !saRozdzialy && (
        <p className="outline-pusto">
          Tu nie ma jeszcze rozdziałów. Spis szczegółowy pokaże kafelki.
        </p>
      )}
      <ul className="outline-list" ref={lista}>
        {/* Kafelki stojące przed pierwszym rozdziałem też muszą być osiągalne —
            dlatego w szczegółowym spisie mają własny podpis. */}
        {szczegolowy && items[0]?.level === 'kafelek' && (
          <li>
            <div className="outline-wiersz">
              {saRozdzialy ? strzalka(POCZATEK) : <span className="outline-chev pusty" />}
              <span className="outline-item level-1 outline-poczatek">Początek</span>
            </div>
            {rzadKropek(POCZATEK, 1)}
          </li>
        )}
        {items.map((it, i) => {
          if (it.level === 'kafelek' && !szczegolowy) return null
          if (it.level === 'kafelek') {
            if (zwiniety(wlasciciele[i])) return null
            return (
              <li key={it.domId}>
                <button
                  className={`outline-item outline-kafelek ${kreska(it.nodeId)} ${
                    active === it.domId ? 'active' : ''
                  } ${biezacy === it.nodeId ? 'outline-tu' : ''}`}
                  style={{ paddingLeft: wciecia[i] * 12 }}
                  title={onMove ? `${it.text} — przeciągnij, aby przestawić` : it.text}
                  draggable={!!onMove}
                  onDragStart={(e) => {
                    ciagniety.current = it.nodeId
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData(MIME, it.nodeId)
                  }}
                  {...cel(it, i)}
                  onClick={() => goTo(it.domId)}
                >
                  {kropka(it)}
                  <span className="outline-tekst" data-ruch={`t-${it.nodeId}`}>
                    {it.text || '(bez nazwy)'}
                  </span>
                </button>
              </li>
            )
          }
          const level = it.level
          const maKafelki = szczegolowy && kafelkiRozdzialu.has(it.nodeId)
          return (
            <li key={it.domId}>
              <div className="outline-wiersz" data-ruch={`w-${it.nodeId}`}>
                {maKafelki ? (
                  strzalka(it.nodeId)
                ) : (
                  <span
                    className={`outline-chev ${
                      !szczegolowy && active === it.domId ? 'open' : 'pusty'
                    }`}
                  >
                    {!szczegolowy && active === it.domId ? '▸' : ''}
                  </span>
                )}
                {/* Rozdziału się nie ciągnie — jest szkieletem wykładu. Ale
                    jest celem: upuszczenie tuż pod nim przenosi kafelek do
                    tego rozdziału, i tak przechodzi się między rozdziałami. */}
                <button
                  className={`outline-item level-${it.level} ${kreska(it.nodeId)} ${
                    active === it.domId ? 'active' : ''
                  }`}
                  title={it.text}
                  {...cel(it, i)}
                  onClick={() => {
                    if (maKafelki && zwiniety(it.nodeId)) przelacz(it.nodeId)
                    goTo(it.domId)
                  }}
                  onContextMenu={onMenu && ((e) => onMenu(e, it.nodeId))}
                >
                  {it.text || '(bez nazwy)'}
                </button>
                {onPoziom && (
                  <span className="outline-poziom">
                    <button
                      title="Ważniejszy: poziom wyżej"
                      disabled={level === 1}
                      onClick={() => onPoziom(it.nodeId, (level - 1) as PoziomRozdzialu)}
                    >
                      <Icon name="poziomWyzej" size={0.95} />
                    </button>
                    <button
                      title="Mniej ważny: poziom niżej"
                      disabled={level === POZIOM_MAX}
                      onClick={() => onPoziom(it.nodeId, (level + 1) as PoziomRozdzialu)}
                    >
                      <Icon name="poziomNizej" size={0.95} />
                    </button>
                  </span>
                )}
              </div>
              {szczegolowy && rzadKropek(it.nodeId, wciecia[i])}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
