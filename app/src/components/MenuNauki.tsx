import { useDialogs } from './Dialogs'
import { Icon } from './Icon'
import { dolozDoSektora, utworzSektor, utworzZadania, wyjmijZSektora } from '../nauka'
import type { JednostkaNauki, PathNode } from '../types'

/** Menu pod prawym przyciskiem w widoku Nauka. Tu Linia jest tylko do
 *  czytania, więc menu dotyczy sektorów: zrób sektor z rozdziału, dodaj albo
 *  wyjmij kafelki, nowe zadanie. */
export function MenuNauki({
  x,
  y,
  pathId,
  wezel,
  cele,
  ordered,
  sektory,
  nazwaWezla,
  onZamknij,
  onOtworz,
  onWybieraj,
  doPaska,
}: {
  x: number
  y: number
  pathId: string
  /** Węzeł pod kursorem. */
  wezel: PathNode | undefined
  /** Na czym działa menu: zaznaczone (gdy kliknięto jedno z nich) albo sam węzeł. */
  cele: string[]
  ordered: PathNode[]
  sektory: JednostkaNauki[]
  nazwaWezla: (n: PathNode) => string
  onZamknij: () => void
  onOtworz?: (conceptId: string) => void
  onWybieraj?: (sektorId: string) => void
  /** Kafelek „Zadanie" stojący w Linii sektora przechodzi do paska zadań. */
  doPaska?: (sektorId: string) => Promise<void>
}) {
  const dlg = useDialogs()
  const tylkoSektory = sektory.filter((s) => s.rodzaj === 'sektor')
  const sektorWezla = (id: string) => tylkoSektory.find((s) => s.wezly.includes(id))
  const zrob = (fn: () => Promise<unknown> | void) => () => {
    onZamknij()
    void fn()
  }
  const komunikat = (t: string) => window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: t }))

  /** Rozdział razem z tym, co pod nim — aż do następnego rozdziału tego
   *  samego albo wyższego poziomu. */
  const zawartoscRozdzialu = (h: PathNode): string[] => {
    if (h.kind !== 'heading') return []
    const i = ordered.findIndex((n) => n.id === h.id)
    const out = [h.id]
    for (let k = i + 1; k < ordered.length; k++) {
      const n = ordered[k]
      if (n.kind === 'heading' && n.level <= h.level) break
      if (n.kind !== 'comment') out.push(n.id)
    }
    return out
  }

  const rozdzial = wezel?.kind === 'heading'
  const wezly = rozdzial && wezel ? zawartoscRozdzialu(wezel) : cele.filter((id) => ordered.find((n) => n.id === id)?.kind !== 'comment')
  const opis = rozdzial ? `rozdział „${wezel && nazwaWezla(wezel)}"` : wezly.length > 1 ? `zaznaczone (${wezly.length})` : wezel ? `„${nazwaWezla(wezel)}"` : ''
  const wspolny = wezly.length ? sektorWezla(wezly[0]) : undefined
  const wszystkieW = (s: JednostkaNauki) => wezly.length > 0 && wezly.every((id) => s.wezly.includes(id))
  const sektorZadania = wezel ? sektorWezla(wezel.id) : undefined

  const nowySektor = async () => {
    const nazwa = await dlg.prompt({
      title: 'Nowy sektor',
      label: 'Nazwa sektora',
      value: wezel ? nazwaWezla(wezel) : '',
      confirmLabel: 'Utwórz',
    })
    if (!nazwa?.trim()) return
    const kolejno = ordered.filter((n) => wezly.includes(n.id)).map((n) => n.id)
    await utworzSektor(pathId, nazwa.trim(), kolejno)
    komunikat(`Sektor „${nazwa.trim()}"`)
  }

  const noweZadanie = async (s: JednostkaNauki) => {
    const [id] = await utworzZadania(s.id, [{}])
    if (id) onOtworz?.(id)
  }

  return (
    <div
      className="tree-menu linear-menu menu-nauki"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      ref={(el) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = Math.min(0, window.innerWidth - 6 - r.right)
        const dy = Math.min(0, window.innerHeight - 6 - r.bottom)
        if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`
      }}
    >
      {wezly.length > 0 && (
        <>
          <div className="tree-menu-where">Nauka: {opis}</div>
          {rozdzial ? (
            <button className="tree-menu-item" onClick={zrob(nowySektor)}>
              <Icon name="nauka" size={1} /> Zrób sektor z rozdziału
            </button>
          ) : (
            <button className="tree-menu-item" onClick={zrob(nowySektor)}>
              <Icon name="nauka" size={1} /> Nowy sektor z {wezly.length > 1 ? 'zaznaczonych' : 'tego kafelka'}
            </button>
          )}
          {tylkoSektory
            .filter((s) => !wszystkieW(s))
            .map((s) => (
              <button
                key={s.id}
                className="tree-menu-item"
                style={{ '--sektor': s.kolor } as React.CSSProperties}
                onClick={zrob(async () => {
                  await dolozDoSektora(s.id, ordered.filter((n) => wezly.includes(n.id)).map((n) => n.id))
                  komunikat(`Dodano do sektora „${s.nazwa}"`)
                })}
              >
                <span className="menu-nauki-kropka" /> Dodaj do „{s.nazwa}"
              </button>
            ))}
          {wspolny && wszystkieW(wspolny) && (
            <button
              className="tree-menu-item"
              onClick={zrob(() => wyjmijZSektora(wspolny.id, wezly))}
            >
              <Icon name="usun" size={1} /> Wyjmij z „{wspolny.nazwa}"
            </button>
          )}
          <div className="tree-menu-sep" />
        </>
      )}
      {(sektorZadania ? [sektorZadania] : tylkoSektory).map((s) => (
        <button key={s.id} className="tree-menu-item" onClick={zrob(() => noweZadanie(s))}>
          <Icon name="kafelek" size={1} /> Nowe zadanie w „{s.nazwa}"
        </button>
      ))}
      {sektorZadania && doPaska && (
        <button className="tree-menu-item" onClick={zrob(() => doPaska(sektorZadania.id))}>
          <Icon name="przesun" size={1} /> Przenieś do paska zadań „{sektorZadania.nazwa}"
        </button>
      )}
      {sektorZadania && onWybieraj && (
        <button className="tree-menu-item" onClick={zrob(() => onWybieraj(sektorZadania.id))}>
          <Icon name="edycja" size={1} /> Wybieraj kafelki „{sektorZadania.nazwa}" klikaniem
        </button>
      )}
      {!tylkoSektory.length && !wezly.length && (
        <div className="tree-menu-where">Najpierw zrób sektor</div>
      )}
    </div>
  )
}
