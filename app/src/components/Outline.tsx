import { useEffect, useRef, useState } from 'react'

export interface OutlineItem {
  /** id elementu nagłówka w dokumencie (do przewijania). */
  domId: string
  text: string
  /** 1–3 = rozdział i podrozdziały; 'kafelek' = pozycja pod rozdziałem. */
  level: 1 | 2 | 3 | 'kafelek'
  /** Plakietka rodzaju przy kafelku (DEF, TW…). */
  znak?: string
  /** Kolor rodzaju — żeby definicje odróżniały się od twierdzeń wzrokiem. */
  barwa?: string
}

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
}

/** Spis treści ścieżki (jak konspekt w Google Docs): lista rozdziałów po
 *  lewej, klik przewija do miejsca, bieżący rozdział jest podświetlony.
 *  Panel można schować — wybór jest zapamiętywany. */
export function Outline({ items }: Props) {
  const [open, setOpen] = useState(() => localStorage.getItem('ui.outline') !== '0')
  useEffect(() => {
    localStorage.setItem('ui.outline', open ? '1' : '0')
  }, [open])

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

  /** Przewija do nagłówka i przez chwilę trzyma go na miejscu: treść nad nim
   *  (wzory, podglądy stron) dorasta już po przewinięciu i zepchnęłaby cel
   *  w dół. Przypinanie kończy się, gdy użytkownik sam przewinie. */
  const goTo = (domId: string) => {
    const first = znajdz(domId)
    if (!first) return
    const scroller = scrollParent(first)
    if (!scroller) {
      first.scrollIntoView({ block: 'start' })
      return
    }
    let stop = false
    const cancel = () => {
      stop = true
    }
    scroller.addEventListener('wheel', cancel, { passive: true })
    scroller.addEventListener('touchstart', cancel, { passive: true })

    const align = () => {
      const el = znajdz(domId)
      if (!el) return
      const delta =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12
      if (Math.abs(delta) > 2) scroller.scrollTop += delta
    }
    align()

    const until = performance.now() + 1500
    const tick = () => {
      if (stop || performance.now() > until) {
        scroller.removeEventListener('wheel', cancel)
        scroller.removeEventListener('touchstart', cancel)
        return
      }
      align()
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
    <nav className="outline">
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
                  className={`outline-item outline-kafelek ${
                    active === it.domId ? 'active' : ''
                  }`}
                  title={it.text}
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
                <button
                  className={`outline-item level-${it.level} ${
                    active === it.domId ? 'active' : ''
                  }`}
                  title={it.text}
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
