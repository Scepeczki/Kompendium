import { useEffect, useRef, useState } from 'react'

export interface OutlineItem {
  /** id elementu nagłówka w dokumencie (do przewijania). */
  domId: string
  /** id węzła ścieżki — po nim przestawiamy kolejność przeciąganiem. */
  nodeId: string
  text: string
  /** 1–3 = rozdział i podrozdziały; 'kafelek' = pozycja pod rozdziałem. */
  level: 1 | 2 | 3 | 'kafelek'
  /** Plakietka rodzaju przy kafelku (DEF, TW…). */
  znak?: string
  /** Kolor rodzaju — żeby definicje odróżniały się od twierdzeń wzrokiem. */
  barwa?: string
}

/** Przeciąganie pozycji spisu — własny typ, żeby nie mieszać się z kafelkami
 *  ciągniętymi z listy po lewej. */
const MIME = 'text/x-komp-spis'

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
}

const SZEROKOSC = 'ui.outlineWidth'
const MIN_SZER = 160
const MAX_SZER = 560

/** Spis treści ścieżki (jak konspekt w Google Docs): lista rozdziałów po
 *  lewej, klik przewija do miejsca, bieżący rozdział jest podświetlony.
 *  Panel można schować — wybór jest zapamiętywany. */
export function Outline({ items, onMove }: Props) {
  const [open, setOpen] = useState(() => localStorage.getItem('ui.outline') !== '0')
  useEffect(() => {
    localStorage.setItem('ui.outline', open ? '1' : '0')
  }, [open])

  /** Szerokość spisu — długie nazwy twierdzeń nie mieszczą się w 210 px,
   *  a przy krótkich szkoda miejsca na tekst. Wybór zostaje zapamiętany. */
  const [szer, setSzer] = useState(() => {
    const z = Number(localStorage.getItem(SZEROKOSC))
    return z >= MIN_SZER && z <= MAX_SZER ? z : 210
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
  /** Rozwinięte rozdziały — pod nimi widać kafelki. */
  const [rozwiniete, setRozwiniete] = useState<Set<string>>(new Set())
  const visible = useRef(new Set<string>())

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
  const goTo = (domId: string) => {
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

  /** Rozdział, pod którym stoi pozycja o tym numerze. */
  const rozdzialNad = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (items[j].level !== 'kafelek') return items[j].domId
    return ''
  }
  /** Ile kafelków siedzi pod rozdziałem o tym numerze. */
  const ileDzieci = (i: number) => {
    let n = 0
    for (let j = i + 1; j < items.length && items[j].level === 'kafelek'; j++) n++
    return n
  }
  /** Sąsiedzi wybranej szczeliny — liczone na PEŁNEJ liście, także po
   *  zwiniętych rozdziałach. Dzięki temu upuszczenie tuż pod nagłówkiem
   *  zwiniętego rozdziału wkłada kafelek do jego środka, a nie za nim. */
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

  const przelacz = (domId: string) =>
    setRozwiniete((prev) => {
      const next = new Set(prev)
      if (next.has(domId)) next.delete(domId)
      else next.add(domId)
      return next
    })

  if (items.length === 0) return null

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
      className="outline"
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
        onDoubleClick={() => setSzer(210)}
      />
      <div className="outline-head">
        <span className="outline-title">Spis treści</span>
        <button
          className="folder-action"
          title="Schowaj spis treści"
          onClick={() => setOpen(false)}
        >
          «
        </button>
      </div>
      <ul className="outline-list">
        {/* Kafelki stojące przed pierwszym rozdziałem też muszą być osiągalne —
            inaczej ścieżka bez rozdziałów miałaby pusty spis. */}
        {items[0]?.level === 'kafelek' && (
          <li>
            <div className="outline-wiersz">
              <button
                className={`outline-chev ${rozwiniete.has('') ? 'open' : ''}`}
                title={rozwiniete.has('') ? 'Zwiń' : `Pokaż, co jest na początku (${ileDzieci(-1)})`}
                onClick={() => przelacz('')}
              >
                ▸
              </button>
              <span className="outline-item level-1 outline-poczatek">Początek</span>
            </div>
          </li>
        )}
        {items.map((it, i) => {
          // Kafelki chowają się pod swoim rozdziałem. Spis ma prowadzić do
          // konkretnej definicji czy twierdzenia, a nie tylko do rozdziału —
          // ale nierozwinięty ma zostać krótką listą rozdziałów.
          if (it.level === 'kafelek' && !rozwiniete.has(rozdzialNad(i))) return null
          if (it.level === 'kafelek') {
            return (
              <li key={it.domId}>
                <button
                  className={`outline-item outline-kafelek ${kreska(it.nodeId)} ${
                    active === it.domId ? 'active' : ''
                  }`}
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
                  {it.znak && (
                    <span className="outline-znak" style={{ color: it.barwa }}>
                      {it.znak}
                    </span>
                  )}
                  <span className="outline-tekst">{it.text || '(bez nazwy)'}</span>
                </button>
              </li>
            )
          }
          const dzieci = ileDzieci(i)
          const otwarty = rozwiniete.has(it.domId)
          return (
            <li key={it.domId}>
              <div className="outline-wiersz">
                {dzieci > 0 ? (
                  <button
                    className={`outline-chev ${otwarty ? 'open' : ''}`}
                    title={otwarty ? 'Zwiń' : `Pokaż, co jest w środku (${dzieci})`}
                    onClick={() => przelacz(it.domId)}
                  >
                    ▸
                  </button>
                ) : (
                  <span className="outline-chev pusty" />
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
                  onClick={() => goTo(it.domId)}
                >
                  {it.text || '(bez nazwy)'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
