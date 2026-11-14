import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialogs } from './Dialogs'
import { useBlockTypes } from '../blockTypes'
import { dolozDoSektora, utworzSektor, wyjmijZSektora } from '../nauka'
import type { Concept, JednostkaNauki, PathNode } from '../types'

/** Przegląd: cała Linia jako jedna linia z kuleczkami. Kafelek to kuleczka,
 *  rozdział to podpis, sektor to barwny odcinek linii. Sektoruje się tu
 *  przeciąganiem po kuleczkach (albo klikiem w rozdział) — bez przewijania
 *  długiej Linii i bez Ctrl+klików. */
export function PrzegladSektorow({
  pathId,
  ordered,
  sektory,
  kafelek,
  nazwaWezla,
  onPokaz,
  onWybierz,
}: {
  pathId: string
  ordered: PathNode[]
  sektory: JednostkaNauki[]
  kafelek: Map<string, Concept>
  nazwaWezla: (n: PathNode) => string
  /** Przewija Linię do węzła. */
  onPokaz: (nodeId: string) => void
  onWybierz: (sektorId: string) => void
}) {
  const dlg = useDialogs()
  const typy = useBlockTypes()
  const wiersze = useMemo(() => ordered.filter((n) => n.kind !== 'comment'), [ordered])

  // ---- który węzeł do którego sektora (jak pasma w Linii) ----
  const { doSektora, naprawde } = useMemo(() => {
    const naprawde = new Map<string, JednostkaNauki>()
    for (const s of sektory) for (const w of s.wezly) naprawde.set(w, s)
    const doSektora = new Map(naprawde)
    for (let i = 0; i < wiersze.length; i++) {
      if (naprawde.has(wiersze[i].id)) continue
      let k = i
      while (k < wiersze.length && !naprawde.has(wiersze[k].id) && (wiersze[k].kind === 'text' || wiersze[k].kind === 'heading')) k++
      const przed = naprawde.get(wiersze[i - 1]?.id ?? '')
      const po = naprawde.get(wiersze[k]?.id ?? '')
      if (przed && przed === po) for (let m = i; m < k; m++) doSektora.set(wiersze[m].id, przed)
      i = Math.max(i, k - 1)
    }
    return { doSektora, naprawde }
  }, [sektory, wiersze])

  // ---- zaznaczanie przeciąganiem ----
  const [zaz, setZaz] = useState<Set<string>>(new Set())
  const kotwica = useRef<number | null>(null)
  const ciagnie = useRef(false)
  useEffect(() => {
    const pusc = () => (ciagnie.current = false)
    window.addEventListener('mouseup', pusc)
    return () => window.removeEventListener('mouseup', pusc)
  }, [])
  // zaznaczone, których już nie ma w Linii, wypadają
  useEffect(() => {
    setZaz((z) => {
      const jest = new Set(wiersze.map((n) => n.id))
      const nowe = new Set([...z].filter((id) => jest.has(id)))
      return nowe.size === z.size ? z : nowe
    })
  }, [wiersze])

  const zakres = (a: number, b: number) =>
    new Set(wiersze.slice(Math.min(a, b), Math.max(a, b) + 1).map((n) => n.id))

  const wcisniety = (e: React.MouseEvent, i: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const id = wiersze[i].id
    if (e.shiftKey && kotwica.current !== null) {
      setZaz(zakres(kotwica.current, i))
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setZaz((z) => {
        const n = new Set(z)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })
      kotwica.current = i
      return
    }
    kotwica.current = i
    ciagnie.current = true
    setZaz(new Set([id]))
    onPokaz(id)
  }
  const najechany = (i: number) => {
    if (ciagnie.current && kotwica.current !== null) setZaz(zakres(kotwica.current, i))
  }
  /** Klik w rozdział: cały rozdział z tym, co pod nim. */
  const rozdzial = (i: number) => {
    const h = wiersze[i]
    if (h.kind !== 'heading') return
    let k = i + 1
    while (k < wiersze.length && !(wiersze[k].kind === 'heading' && (wiersze[k] as { level: number }).level <= h.level)) k++
    kotwica.current = i
    setZaz(zakres(i, k - 1))
    onPokaz(h.id)
  }

  // ---- działania na zaznaczonych ----
  const zaznaczone = wiersze.filter((n) => zaz.has(n.id)).map((n) => n.id)
  const wspolny = zaznaczone.length ? naprawde.get(zaznaczone[0]) : undefined
  const wszystkieW = (s: JednostkaNauki) => zaznaczone.length > 0 && zaznaczone.every((id) => s.wezly.includes(id))
  const nowySektor = async () => {
    const pierwszy = wiersze.find((n) => zaz.has(n.id))
    const nazwa = await dlg.prompt({
      title: 'Nowy sektor',
      label: 'Nazwa sektora',
      value: pierwszy ? nazwaWezla(pierwszy) : '',
      confirmLabel: 'Utwórz',
    })
    if (!nazwa?.trim()) return
    await utworzSektor(pathId, nazwa.trim(), zaznaczone)
    setZaz(new Set())
  }

  const typ = (n: PathNode) =>
    n.kind === 'block' ? kafelek.get(n.conceptId)?.type : n.kind === 'fusion' ? n.type : undefined
  const ileKafelkow = (s: JednostkaNauki) =>
    wiersze.filter((n) => s.wezly.includes(n.id) && (n.kind === 'block' || n.kind === 'fusion')).length

  return (
    <div className="przeglad">
      <p className="hint przeglad-rada">
        Przeciągnij po kuleczkach, żeby zaznaczyć kilka kafelków naraz; klik w rozdział zaznacza cały
        rozdział. Shift — zakres, Ctrl — pojedyncze.
      </p>
      <ol className="przeglad-lista" onMouseLeave={() => (ciagnie.current = false)}>
        {wiersze.map((n, i) => {
          const s = doSektora.get(n.id)
          // podpis sektora tylko przy jego pierwszym kawałku
          const podpis = !!s && wiersze.findIndex((x) => doSektora.get(x.id) === s) === i
          const prev = doSektora.get(wiersze[i - 1]?.id ?? '')
          const next = doSektora.get(wiersze[i + 1]?.id ?? '')
          const pierwszy = !!s && prev !== s
          const ostatni = !!s && next !== s
          const styl = s ? ({ '--sektor': s.kolor ?? '#7a869a' } as React.CSSProperties) : undefined
          const klasa = [
            'przeglad-wiersz',
            `rodzaj-${n.kind}`,
            s ? 'w-sektorze' : '',
            s && !naprawde.has(n.id) ? 'wypelnienie' : '',
            pierwszy ? 'pierwszy' : '',
            ostatni ? 'ostatni' : '',
            zaz.has(n.id) ? 'zaznaczony' : '',
          ].join(' ')
          const def = typ(n) ? typy.def(typ(n)!) : undefined
          return (
            <li key={n.id} className={klasa} style={styl} data-wezel={n.id}>
              {podpis && s && (
                <button className="przeglad-sektor" onClick={() => onWybierz(s.id)} title="Pokaż sektor w panelu">
                  <span className="przeglad-sektor-kropka" />
                  {s.nazwa}
                  <span className="przeglad-sektor-ile">{ileKafelkow(s)} kaf.</span>
                </button>
              )}
              <div
                className="przeglad-rzad"
                onMouseDown={(e) => (n.kind === 'heading' ? e.button === 0 && (e.preventDefault(), rozdzial(i)) : wcisniety(e, i))}
                onMouseEnter={() => najechany(i)}
                title={nazwaWezla(n)}
              >
                <span className="przeglad-tor">
                  <span
                    className={`przeglad-kulka ${n.kind === 'text' ? 'notatka' : ''}`}
                    style={def && !s ? ({ borderColor: def.color } as React.CSSProperties) : undefined}
                  />
                </span>
                {n.kind === 'heading' ? (
                  <span className={`przeglad-rozdzial poziom-${n.level}`}>{n.text || '(rozdział)'}</span>
                ) : (
                  <span className="przeglad-nazwa">
                    {def && (
                      <span className="przeglad-typ" style={{ color: def.color }}>
                        {def.short}
                      </span>
                    )}
                    {n.kind === 'text' ? <em>notatka</em> : nazwaWezla(n)}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {zaznaczone.length > 0 && (
        <div className="przeglad-akcje">
          <span className="przeglad-akcje-ile">Zaznaczone: {zaznaczone.length}</span>
          <button className="btn btn-primary btn-maly" onClick={nowySektor}>
            Nowy sektor
          </button>
          {sektory
            .filter((s) => !wszystkieW(s))
            .map((s) => (
              <button
                key={s.id}
                className="btn btn-maly przeglad-dodaj"
                style={{ '--sektor': s.kolor } as React.CSSProperties}
                onClick={async () => {
                  await dolozDoSektora(s.id, zaznaczone)
                  setZaz(new Set())
                }}
              >
                <span className="przeglad-sektor-kropka" /> do „{s.nazwa}"
              </button>
            ))}
          {wspolny && wszystkieW(wspolny) && (
            <button
              className="btn btn-maly"
              onClick={async () => {
                await wyjmijZSektora(wspolny.id, zaznaczone)
                setZaz(new Set())
              }}
            >
              Wyjmij z „{wspolny.nazwa}"
            </button>
          )}
          <button className="btn btn-link" onClick={() => setZaz(new Set())}>
            Wyczyść
          </button>
        </div>
      )}
    </div>
  )
}
