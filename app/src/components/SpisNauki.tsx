import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useBlockTypes } from '../blockTypes'
import { dniDo, opisDni } from '../nauka'
import { ETAP_SEKTORA } from './WidokSektorow'
import type { JednostkaNauki, PathNode } from '../types'

type Pozycja =
  | { rodzaj: 'sektor'; klucz: string; s: JednostkaNauki }
  | { rodzaj: 'rozdzial'; klucz: string; n: PathNode; tekst: string; poziom: number; s?: JednostkaNauki }
  | { rodzaj: 'kafelek'; klucz: string; nodeId?: string; zadanieId?: string; tekst: string; typ?: string; s?: JednostkaNauki }

const KLUCZ_SPIS = 'ui.nauka.spis'

function czytaj(): boolean {
  try {
    return localStorage.getItem(KLUCZ_SPIS) !== '0'
  } catch {
    return true
  }
}

/** Gdzie w środku stoi pozycja spisu. */
const celPozycji = (p: Pozycja) =>
  p.rodzaj === 'sektor'
    ? null
    : p.rodzaj === 'kafelek' && p.zadanieId
      ? `.widok-sektorow [data-zadanie="${p.zadanieId}"]`
      : `.widok-sektorow [data-seg="${p.rodzaj === 'kafelek' ? p.nodeId : p.n.id}"]`

/** Spis widoku Nauka — po lewej, jak spis treści w Linii, tylko że
 *  pogrupowany w sektory: barwna kreska pokazuje, co do którego należy,
 *  a nagłówek sektora mówi, na jakim jest etapie. Klik przewija środek. */
export function SpisNauki({
  ordered,
  sektory,
  wybrany,
  onWybierzSektor,
}: {
  ordered: PathNode[]
  sektory: JednostkaNauki[]
  wybrany?: string | null
  onWybierzSektor?: (id: string) => void
}) {
  const typy = useBlockTypes()
  const [otwarty, setOtwarty] = useState(czytaj)
  const przelacz = (o: boolean) => {
    setOtwarty(o)
    try {
      localStorage.setItem(KLUCZ_SPIS, o ? '1' : '0')
    } catch {
      // bez zapamiętania — spis i tak działa
    }
  }
  const tylkoSektory = useMemo(() => sektory.filter((s) => s.rodzaj === 'sektor'), [sektory])
  const wezly = useMemo(() => ordered.filter((n) => n.kind !== 'comment'), [ordered])
  const ids = useMemo(() => {
    const out = new Set<string>()
    for (const n of wezly) if (n.kind === 'block') out.add(n.conceptId)
    for (const s of tylkoSektory) for (const z of s.zadania ?? []) out.add(z)
    return [...out].sort()
  }, [wezly, tylkoSektory])
  const kafelki = useLiveQuery(() => db.concepts.where('id').anyOf(ids).toArray(), [ids.join()])
  const kafelek = useMemo(() => new Map((kafelki ?? []).map((c) => [c.id, c])), [kafelki])

  const pozycje = useMemo(() => {
    const naprawde = new Map<string, JednostkaNauki>()
    for (const s of tylkoSektory) for (const w of s.wezly) naprawde.set(w, s)
    // rozdziały i notatki w środku sektora należą do niego (jak w osi)
    const doSektora = new Map(naprawde)
    for (let i = 0; i < wezly.length; i++) {
      if (naprawde.has(wezly[i].id)) continue
      let k = i
      while (k < wezly.length && !naprawde.has(wezly[k].id) && (wezly[k].kind === 'text' || wezly[k].kind === 'heading')) k++
      const przed = naprawde.get(wezly[i - 1]?.id ?? '')
      const po = naprawde.get(wezly[k]?.id ?? '')
      if (przed && przed === po) for (let m = i; m < k; m++) doSektora.set(wezly[m].id, przed)
      i = Math.max(i, k - 1)
    }
    const ostatni = new Map<string, string>()
    for (const n of wezly) {
      const s = naprawde.get(n.id)
      if (s) ostatni.set(s.id, n.id)
    }
    const out: Pozycja[] = []
    const byl = new Set<string>()
    let poprzedni: JednostkaNauki | undefined
    for (const n of wezly) {
      if (n.kind === 'text') continue
      const s = doSektora.get(n.id)
      if (s && s !== poprzedni && !byl.has(s.id)) {
        byl.add(s.id)
        out.push({ rodzaj: 'sektor', klucz: `s:${s.id}`, s })
      }
      poprzedni = s
      if (n.kind === 'heading') {
        out.push({ rodzaj: 'rozdzial', klucz: n.id, n, tekst: n.text || 'rozdział', poziom: n.level, s })
      } else if (n.kind === 'block') {
        const c = kafelek.get(n.conceptId)
        out.push({ rodzaj: 'kafelek', klucz: n.id, nodeId: n.id, tekst: n.nazwa ?? c?.name ?? 'kafelek', typ: c?.type, s })
      } else if (n.kind === 'fusion') {
        out.push({ rodzaj: 'kafelek', klucz: n.id, nodeId: n.id, tekst: n.name || 'grupa', typ: n.type, s })
      }
      const sk = naprawde.get(n.id)
      if (sk && ostatni.get(sk.id) === n.id) {
        for (const z of sk.zadania ?? []) {
          const c = kafelek.get(z)
          if (c) out.push({ rodzaj: 'kafelek', klucz: `z:${sk.id}:${z}`, zadanieId: z, tekst: c.name, typ: c.type, s: sk })
        }
      }
    }
    return out
  }, [wezly, tylkoSektory, kafelek])

  // ---- bieżące miejsce: pozycja, która stoi u góry środka ----
  const [biezacy, setBiezacy] = useState<string | null>(null)
  const lista = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const srodek = document.querySelector<HTMLElement>('.widok-sektorow')
    if (!srodek) return
    let ramka = 0
    const licz = () => {
      ramka = 0
      const gora = srodek.getBoundingClientRect().top + 70
      let akt: string | null = null
      for (const p of pozycje) {
        const sel = celPozycji(p)
        const el = sel ? document.querySelector(sel) : null
        if (!el) continue
        if (el.getBoundingClientRect().top <= gora) akt = p.klucz
        else break
      }
      setBiezacy(akt ?? pozycje.find((p) => p.rodzaj !== 'sektor')?.klucz ?? null)
    }
    const naScroll = () => {
      if (!ramka) ramka = requestAnimationFrame(licz)
    }
    licz()
    srodek.addEventListener('scroll', naScroll, { passive: true })
    return () => {
      srodek.removeEventListener('scroll', naScroll)
      cancelAnimationFrame(ramka)
    }
  }, [pozycje, otwarty])
  // spis jedzie za środkiem, żeby bieżąca pozycja była widać
  useEffect(() => {
    if (!biezacy) return
    lista.current?.querySelector('.sn-poz.biezaca')?.scrollIntoView({ block: 'nearest' })
  }, [biezacy])

  const idz = (p: Pozycja) => {
    if (p.rodzaj === 'sektor') {
      onWybierzSektor?.(p.s.id)
      const pierwszy = pozycje[pozycje.indexOf(p) + 1]
      if (pierwszy) idz(pierwszy)
      return
    }
    const sel = celPozycji(p)
    if (sel) document.querySelector(sel)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  if (!otwarty) {
    return (
      <button className="outline-reopen spis-nauki-otworz" onClick={() => przelacz(true)} title="Pokaż spis">
        Spis
      </button>
    )
  }

  return (
    <nav className="spis-nauki" aria-label="Spis ścieżki w sektorach">
      <div className="spis-nauki-glowa">
        <span className="outline-title">Spis</span>
        <button className="folder-action" title="Schowaj spis" aria-label="Schowaj spis" onClick={() => przelacz(false)}>
          «
        </button>
      </div>
      {!pozycje.length && <p className="spis-nauki-pusto">Ścieżka jest pusta.</p>}
      <ol className="spis-nauki-lista" ref={lista}>
        {pozycje.map((p) => {
          const styl = p.s ? ({ '--sektor': p.s.kolor ?? '#7a869a' } as React.CSSProperties) : undefined
          if (p.rodzaj === 'sektor') {
            const etap =
              p.s.etap === 'powtorki' && p.s.termin ? `powtórka ${opisDni(dniDo(p.s.termin))}` : ETAP_SEKTORA[p.s.etap]
            return (
              <li key={p.klucz} className="sn-sektor-w" style={styl}>
                <button
                  className={`sn-sektor ${wybrany === p.s.id ? 'wybrany' : ''}`}
                  title="Pokaż sektor w panelu z prawej"
                  onClick={() => idz(p)}
                >
                  <span className="sn-kropka" />
                  <span className="sn-sektor-nazwa">{p.s.nazwa}</span>
                  <span className="sn-etap">{etap}</span>
                </button>
              </li>
            )
          }
          const def = p.rodzaj === 'kafelek' && p.typ ? typy.def(p.typ) : undefined
          return (
            <li key={p.klucz} className={`sn-w ${p.s ? 'w-sektorze' : ''}`} style={styl}>
              <button
                className={`sn-poz ${p.rodzaj === 'rozdzial' ? `sn-rozdzial poziom-${Math.min(p.poziom, 3)}` : 'sn-kafelek'} ${
                  biezacy === p.klucz ? 'biezaca' : ''
                }`}
                onClick={() => idz(p)}
              >
                {def && <span className="sn-typ" style={{ background: def.color }} />}
                <span className="sn-tekst">{p.tekst}</span>
                {p.rodzaj === 'kafelek' && p.zadanieId && <span className="sn-mini">zadanie</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
