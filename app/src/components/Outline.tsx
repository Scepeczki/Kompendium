import { useEffect, useRef, useState } from 'react'

export interface OutlineItem {
  /** id elementu nagłówka w dokumencie (do przewijania). */
  domId: string
  text: string
  level: 1 | 2 | 3
}

/** Identyfikator elementu nagłówka — wspólny dla spisu i samego dokumentu. */
export const outlineId = (nodeId: string) => `outline-${nodeId}`

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
  const visible = useRef(new Set<string>())

  // Podświetlenie bieżącego rozdziału: śledzimy, które nagłówki są w oknie,
  // i bierzemy pierwszy z nich w kolejności dokumentu.
  useEffect(() => {
    if (!open || items.length === 0) return
    visible.current.clear()
    const anchor = document.getElementById(items[0].domId)
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
    for (const it of items) {
      const el = document.getElementById(it.domId)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [open, items])

  /** Przewija do nagłówka i przez chwilę trzyma go na miejscu: treść nad nim
   *  (wzory, podglądy stron) dorasta już po przewinięciu i zepchnęłaby cel
   *  w dół. Przypinanie kończy się, gdy użytkownik sam przewinie. */
  const goTo = (domId: string) => {
    const first = document.getElementById(domId)
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
      const el = document.getElementById(domId)
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
        {items.map((it) => (
          <li key={it.domId}>
            <button
              className={`outline-item level-${it.level} ${
                active === it.domId ? 'active' : ''
              }`}
              title={it.text}
              onClick={() => goTo(it.domId)}
            >
              {it.text || '(bez nazwy)'}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
