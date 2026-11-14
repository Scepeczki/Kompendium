import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useBlockTypes } from '../blockTypes'
import { renderMarkdown } from '../markdown'
import { useDialogs } from './Dialogs'
import { MenuNauki } from './MenuNauki'
import { MenuZadania } from './ZadaniaSektora'
import {
  dniDo,
  dolozDoSektora,
  kluczWezla,
  kluczZadania,
  odepnijZadanie,
  opisDni,
  przelaczWSektorze,
  przypnijZadanie,
  utworzSektor,
  wyjmijZSektora,
  znajdzTypZadania,
  znaneKlucze,
} from '../nauka'
import { kluczWlasnej, type Concept, type JednostkaNauki, type PathNode } from '../types'

/** Jeden wiersz widoku: węzeł ścieżki albo zadanie z paska sektora. */
type Wiersz =
  | { rodzaj: 'wezel'; klucz: string; n: PathNode }
  | { rodzaj: 'zadanie'; klucz: string; c: Concept; s: JednostkaNauki }

const ETAP: Record<JednostkaNauki['etap'], string> = {
  nowy: 'jeszcze nie uczony',
  mapowanie: 'mapowanie',
  przerwa: 'przerwa przed testem',
  czat: 'test czatem',
  zadania: 'zadania i test końcowy',
  powtorki: 'powtórki',
}

/** Podgląd treści — Markdown z wzorami liczy się raz na tekst. */
const pamiecPodgladu = new Map<string, string>()
function podglad(md: string): string {
  let h = pamiecPodgladu.get(md)
  if (h === undefined) {
    h = renderMarkdown(md)
    if (pamiecPodgladu.size > 2000) pamiecPodgladu.clear()
    pamiecPodgladu.set(md, h)
  }
  return h
}

/** Widok „Sektory" — domyślny środek widoku Nauka.
 *
 *  Linia jest długa i pocięta notatkami, a do sektorowania potrzeba widzieć
 *  całość. Tu ścieżka to jedna oś: kafelek to kulka i zwarta karta (rodzaj,
 *  nazwa, dwie linijki treści, znaczki), rozdział to kreska z podpisem,
 *  sektor to gruby, barwny odcinek osi z nagłówkiem, a jego zadania stoją
 *  na końcu. Zaznacza się przeciąganiem po osi. */
export function WidokSektorow({
  pathId,
  ordered,
  sektory,
  wybieranySektor,
  onWybieraj,
  onWybierzSektor,
  onZaznaczenie,
  onOtworz,
  onWstawKafelek,
  onWyjmijZLinii,
}: {
  pathId: string
  ordered: PathNode[]
  sektory: JednostkaNauki[]
  wybieranySektor?: string | null
  onWybieraj?: (id: string | null) => void
  /** Klik w nagłówek sektora: pokaż go w panelu. */
  onWybierzSektor?: (id: string) => void
  /** Zaznaczenie idzie do panelu („Sektor z zaznaczonych"). */
  onZaznaczenie?: (ids: string[]) => void
  onOtworz?: (conceptId: string) => void
  onWstawKafelek?: (conceptId: string, afterId: string | null, beforeId: string | null) => string
  onWyjmijZLinii?: (nodeId: string) => void
}) {
  const dlg = useDialogs()
  const typy = useBlockTypes()
  const tylkoSektory = useMemo(() => sektory.filter((s) => s.rodzaj === 'sektor'), [sektory])
  const wezly = useMemo(() => ordered.filter((n) => n.kind !== 'comment'), [ordered])

  // ---- dane kafelków: treść do podglądu, strony, pamięć ----
  const idsKafelkow = useMemo(() => {
    const out = new Set<string>()
    for (const n of wezly) {
      if (n.kind === 'block') out.add(n.conceptId)
      if (n.kind === 'fusion') for (const p of n.parts) out.add(p.conceptId)
    }
    for (const s of tylkoSektory) for (const z of s.zadania ?? []) out.add(z)
    return [...out].sort()
  }, [wezly, tylkoSektory])
  const dane = useLiveQuery(async () => {
    const [cs, vs, sp] = await Promise.all([
      db.concepts.where('id').anyOf(idsKafelkow).toArray(),
      db.versions.where('conceptId').anyOf(idsKafelkow).toArray(),
      db.subpages.where('conceptId').anyOf(idsKafelkow).toArray(),
    ])
    return { cs, vs, sp }
  }, [idsKafelkow.join()])
  const pamiec = useLiveQuery(() => db.pamiec.toArray(), []) ?? []
  const kafelek = useMemo(() => new Map((dane?.cs ?? []).map((c) => [c.id, c])), [dane])
  const wersja = useMemo(() => new Map((dane?.vs ?? []).map((v) => [v.id, v])), [dane])
  const slabe = useMemo(() => new Set(pamiec.filter((p) => p.slaby).map((p) => p.klucz)), [pamiec])
  const znane = useLiveQuery(() => znaneKlucze(), []) ?? new Set<string>()
  const klucze = useMemo(() => new Set(pamiec.map((p) => p.klucz)), [pamiec])
  /** Dołożone do nauczonego sektora i jeszcze nieuczone. */
  const nowyKlucz = (k: string | null, s: JednostkaNauki | undefined) =>
    !!k && !!s && s.etap === 'powtorki' && !klucze.has(k) && !znane.has(k)
  const typZadania = znajdzTypZadania(typy.all)

  // ---- wiersze i sektory (notatki w środku sektora dostają jego pasmo) ----
  const { wiersze, doSektora, naprawde } = useMemo(() => {
    const naprawde = new Map<string, JednostkaNauki>()
    for (const s of tylkoSektory) for (const w of s.wezly) naprawde.set(w, s)
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
    const wiersze: Wiersz[] = []
    for (const n of wezly) {
      wiersze.push({ rodzaj: 'wezel', klucz: n.id, n })
      const s = naprawde.get(n.id)
      if (s && ostatni.get(s.id) === n.id) {
        for (const z of s.zadania ?? []) {
          const c = kafelek.get(z)
          if (c) wiersze.push({ rodzaj: 'zadanie', klucz: `zad:${s.id}:${z}`, c, s })
        }
      }
    }
    return { wiersze, doSektora, naprawde }
  }, [wezly, tylkoSektory, kafelek])
  const sektorWiersza = (w: Wiersz | undefined) =>
    !w ? undefined : w.rodzaj === 'zadanie' ? w.s : doSektora.get(w.n.id)

  // ---- zaznaczanie (tylko węzły; zadania należą do swojego sektora) ----
  const [zaz, setZaz] = useState<Set<string>>(new Set())
  const kotwica = useRef<number | null>(null)
  const ciagnie = useRef(false)
  const indeks = useMemo(() => new Map(wezly.map((n, i) => [n.id, i])), [wezly])
  useEffect(() => {
    const pusc = () => (ciagnie.current = false)
    window.addEventListener('mouseup', pusc)
    return () => window.removeEventListener('mouseup', pusc)
  }, [])
  useEffect(() => {
    onZaznaczenie?.(wezly.filter((n) => zaz.has(n.id)).map((n) => n.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zaz])
  const zakres = (a: number, b: number) =>
    new Set(wezly.slice(Math.min(a, b), Math.max(a, b) + 1).map((n) => n.id))
  const rozdzial = (i: number) => {
    const h = wezly[i]
    if (h.kind !== 'heading') return new Set<string>()
    let k = i + 1
    while (k < wezly.length && !(wezly[k].kind === 'heading' && (wezly[k] as { level: number }).level <= h.level)) k++
    return zakres(i, k - 1)
  }
  const naOsi = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const i = indeks.get(id)!
    const n = wezly[i]
    if (e.shiftKey && kotwica.current !== null) return setZaz(zakres(kotwica.current, i))
    if (e.ctrlKey || e.metaKey) {
      kotwica.current = i
      return setZaz((z) => {
        const x = new Set(z)
        if (x.has(id)) x.delete(id)
        else x.add(id)
        return x
      })
    }
    kotwica.current = i
    if (n.kind === 'heading') return setZaz(rozdzial(i))
    ciagnie.current = true
    setZaz(new Set([id]))
  }
  const najechany = (id: string) => {
    const i = indeks.get(id)
    if (ciagnie.current && kotwica.current !== null && i !== undefined) setZaz(zakres(kotwica.current, i))
  }

  // ---- karta: klik rozwija (albo w trybie wybierania dokłada / wyjmuje) ----
  const [rozwiniete, setRozwiniete] = useState<Set<string>>(new Set())
  const klikKarty = (e: React.MouseEvent, w: Wiersz) => {
    if ((e.target as Element).closest('button, a')) return
    if (w.rodzaj === 'wezel' && (e.ctrlKey || e.metaKey || e.shiftKey)) return naOsi(e, w.n.id)
    if (w.rodzaj === 'wezel' && wybieranySektor) {
      void przelaczWSektorze(wybieranySektor, w.n.id)
      return
    }
    setRozwiniete((r) => {
      const x = new Set(r)
      if (x.has(w.klucz)) x.delete(w.klucz)
      else x.add(w.klucz)
      return x
    })
  }

  // ---- menu ----
  const [menu, setMenu] = useState<
    | { x: number; y: number; rodzaj: 'wezel'; n: PathNode }
    | { x: number; y: number; rodzaj: 'zadanie'; c: Concept; s: JednostkaNauki }
    | null
  >(null)
  const zamknijMenu = useCallback(() => setMenu(null), [])
  useEffect(() => {
    if (!menu || menu.rodzaj !== 'wezel') return
    const zamknij = () => setMenu(null)
    window.addEventListener('mousedown', zamknij)
    window.addEventListener('scroll', zamknij, true)
    return () => {
      window.removeEventListener('mousedown', zamknij)
      window.removeEventListener('scroll', zamknij, true)
    }
  }, [menu])

  /** Zadanie z paska staje w Linii na końcu swojego sektora. */
  const doLinii = (sektorId: string, conceptId: string) => {
    if (!onWstawKafelek) return
    const s = tylkoSektory.find((x) => x.id === sektorId)
    const wS = ordered.filter((n) => s?.wezly.includes(n.id))
    const ost = wS[wS.length - 1] ?? ordered[ordered.length - 1]
    const i = ost ? ordered.indexOf(ost) : -1
    const id = onWstawKafelek(conceptId, ost?.id ?? null, ordered[i + 1]?.id ?? null)
    void (async () => {
      await dolozDoSektora(sektorId, [id])
      await odepnijZadanie(sektorId, conceptId)
    })()
  }

  // ---- opis węzła ----
  const nazwa = (n: PathNode) =>
    n.kind === 'heading'
      ? n.text || 'rozdział'
      : n.kind === 'block'
        ? (n.nazwa ?? kafelek.get(n.conceptId)?.name ?? 'kafelek')
        : n.kind === 'fusion'
          ? n.name || 'grupa'
          : 'notatka'
  const trescKafelka = (c: Concept | undefined, versionId: string | null, wlasne?: Record<string, string>) => {
    if (!c) return ''
    const v = wersja.get(versionId ?? '') ?? wersja.get(c.currentVersionId)
    if (!v) return ''
    return wlasne?.[kluczWlasnej(v.id, null)] ?? v.content
  }
  const tresc = (w: Wiersz): string => {
    if (w.rodzaj === 'zadanie') return trescKafelka(w.c, null)
    const n = w.n
    if (n.kind === 'block') return trescKafelka(kafelek.get(n.conceptId), n.versionId, n.wlasneTresci)
    if (n.kind === 'fusion')
      return n.content ?? n.parts.map((p) => trescKafelka(kafelek.get(p.conceptId), p.versionId, p.wlasneTresci)).join('\n\n')
    if (n.kind === 'text') return n.text
    return ''
  }
  const strony = (c: Concept | undefined, versionId: string | null) => {
    if (!c) return []
    const vid = wersja.get(versionId ?? '')?.id ?? c.currentVersionId
    return (dane?.sp ?? []).filter((x) => x.conceptId === c.id && x.versionId === vid).sort((a, b) => a.order - b.order)
  }

  // ---- działania na zaznaczonych ----
  const zaznaczone = wezly.filter((n) => zaz.has(n.id)).map((n) => n.id)
  const wspolny = zaznaczone.length ? naprawde.get(zaznaczone[0]) : undefined
  const wszystkieW = (s: JednostkaNauki) => zaznaczone.length > 0 && zaznaczone.every((id) => s.wezly.includes(id))
  const nowySektor = async () => {
    const pierwszy = wezly.find((n) => zaz.has(n.id))
    const nz = await dlg.prompt({
      title: 'Nowy sektor',
      label: 'Nazwa sektora',
      value: pierwszy ? nazwa(pierwszy) : '',
      confirmLabel: 'Utwórz',
    })
    if (!nz?.trim()) return
    await utworzSektor(pathId, nz.trim(), zaznaczone)
    setZaz(new Set())
  }
  const ileKafelkow = (s: JednostkaNauki) =>
    wezly.filter((n) => s.wezly.includes(n.id) && (n.kind === 'block' || n.kind === 'fusion')).length
  const ileNowych = (s: JednostkaNauki) =>
    wezly.filter(
      (n) => s.wezly.includes(n.id) && (n.kind === 'block' || n.kind === 'fusion') && nowyKlucz(kluczWezla(n, pathId), s),
    ).length + (s.zadania ?? []).filter((id) => nowyKlucz(kluczZadania(id), s)).length
  const opisEtapu = (s: JednostkaNauki) =>
    s.etap === 'powtorki' && s.termin ? `powtórka ${opisDni(dniDo(s.termin))}` : ETAP[s.etap]

  if (!wezly.length) {
    return (
      <div className="widok-sektorow">
        <p className="hint widok-sektorow-pusto">Ścieżka jest pusta — kafelki dodasz w widoku Linia.</p>
      </div>
    )
  }

  const pierwszyRaz = new Set<string>()
  return (
    <div
      className={`widok-sektorow ${wybieranySektor ? 'wybieranie' : ''}`}
      onMouseLeave={() => (ciagnie.current = false)}
    >
      <div className="ws-kolumna">
        {wybieranySektor && (
          <div
            className="wybieranie-pasek ws-wybieranie"
            style={{ '--sektor': tylkoSektory.find((s) => s.id === wybieranySektor)?.kolor } as React.CSSProperties}
          >
            <span>
              Wybierasz kafelki do <strong>„{tylkoSektory.find((s) => s.id === wybieranySektor)?.nazwa}"</strong> —
              klikaj karty, aby dodać albo wyjąć.
            </span>
            <button className="btn btn-primary btn-maly" onClick={() => onWybieraj?.(null)}>
              Gotowe
            </button>
          </div>
        )}
        <ol className="ws-lista">
          {wiersze.map((w, i) => {
            const s = sektorWiersza(w)
            const pierwszy = !!s && sektorWiersza(wiersze[i - 1]) !== s
            const ostatni = !!s && sektorWiersza(wiersze[i + 1]) !== s
            const naglowek = !!s && pierwszy && !pierwszyRaz.has(s.id)
            if (naglowek && s) pierwszyRaz.add(s.id)
            const ciag = !!s && pierwszy && !naglowek
            const styl = s ? ({ '--sektor': s.kolor ?? '#7a869a' } as React.CSSProperties) : undefined
            const n = w.rodzaj === 'wezel' ? w.n : undefined
            const c = w.rodzaj === 'zadanie' ? w.c : n?.kind === 'block' ? kafelek.get(n.conceptId) : undefined
            const typ = w.rodzaj === 'zadanie' ? w.c.type : n?.kind === 'block' ? c?.type : n?.kind === 'fusion' ? n.type : undefined
            const def = typ ? typy.def(typ) : undefined
            const klucz = n && (n.kind === 'block' || n.kind === 'fusion') ? kluczWezla(n, pathId) : null
            const slaby = !!klucz && slabe.has(klucz)
            const sekt = n ? naprawde.get(n.id) : w.rodzaj === 'zadanie' ? w.s : undefined
            const nowy = nowyKlucz(w.rodzaj === 'zadanie' ? kluczZadania(w.c.id) : klucz, sekt)
            const douczany =
              !!sekt?.douczanie &&
              (w.rodzaj === 'zadanie' ? sekt.douczanie.zadania.includes(w.c.id) : !!n && sekt.douczanie.wezly.includes(n.id))
            const doPoprawy =
              (!!n && !!s && s.doPoprawy?.includes(n.id)) || (w.rodzaj === 'zadanie' && !!w.s.doPoprawy?.includes(w.c.id))
            const zadanie = w.rodzaj === 'zadanie' || (!!c && c.type === typZadania)
            const str = n?.kind === 'block' ? strony(c, n.versionId) : w.rodzaj === 'zadanie' ? strony(w.c, null) : []
            const rozw = rozwiniete.has(w.klucz)
            const klasa = [
              'ws-wiersz',
              n ? `rodzaj-${n.kind}` : 'rodzaj-zadanie-paska',
              s ? 'w-sektorze' : '',
              n && s && !naprawde.has(n.id) ? 'wypelnienie' : '',
              pierwszy ? 'pierwszy' : '',
              ostatni ? 'ostatni' : '',
              n && zaz.has(n.id) ? 'zaznaczony' : '',
              zadanie ? 'zadanie' : '',
            ].join(' ')
            return (
              <li key={w.klucz} className={klasa} style={styl} data-seg={n?.id} data-zadanie={w.rodzaj === 'zadanie' ? w.c.id : undefined}>
                {naglowek && s && (
                  <button className="ws-sektor" onClick={() => onWybierzSektor?.(s.id)} title="Pokaż sektor w panelu">
                    <span className="ws-sektor-kropka" />
                    <span className="ws-sektor-nazwa">{s.nazwa}</span>
                    <span className="ws-sektor-info">
                      {ileKafelkow(s)} kaf.
                      {s.zadania?.length ? ` · ${s.zadania.length} zad.` : ''} · {opisEtapu(s)}
                      {ileNowych(s) > 0 && <span className="ws-sektor-nowe"> · nowe: {ileNowych(s)}</span>}
                    </span>
                  </button>
                )}
                {ciag && s && <div className="ws-ciag">dalej „{s.nazwa}"</div>}
                <div className="ws-rzad">
                  <span
                    className="ws-os"
                    onMouseDown={(e) => (n ? naOsi(e, n.id) : undefined)}
                    onMouseEnter={() => n && najechany(n.id)}
                    title={n ? 'Klik albo przeciągnięcie — zaznacz' : undefined}
                  >
                    <span className="ws-kulka" />
                  </span>
                  {n?.kind === 'heading' ? (
                    <div
                      className={`ws-rozdzial poziom-${n.level}`}
                      onMouseDown={(e) => naOsi(e, n.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu({ x: e.clientX, y: e.clientY, rodzaj: 'wezel', n })
                      }}
                    >
                      {n.text || '(rozdział bez nazwy)'}
                    </div>
                  ) : n?.kind === 'text' ? (
                    <div
                      className={`ws-notatka ${rozw ? 'rozwinieta' : ''}`}
                      onClick={(e) => klikKarty(e, w)}
                      onMouseEnter={() => najechany(n.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu({ x: e.clientX, y: e.clientY, rodzaj: 'wezel', n })
                      }}
                    >
                      {n.text.trim() ? (
                        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: podglad(n.text) }} />
                      ) : (
                        <em>pusta notatka</em>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`ws-karta ${rozw ? 'rozwinieta' : ''}`}
                      data-typ={typ}
                      style={def ? typy.style(def.id) : undefined}
                      onClick={(e) => klikKarty(e, w)}
                      onMouseEnter={() => n && najechany(n.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (w.rodzaj === 'zadanie') setMenu({ x: e.clientX, y: e.clientY, rodzaj: 'zadanie', c: w.c, s: w.s })
                        else if (n) setMenu({ x: e.clientX, y: e.clientY, rodzaj: 'wezel', n })
                      }}
                    >
                      <div className="ws-karta-glowa">
                        {def && <span className="type-mini ws-typ">{def.short}</span>}
                        <span className="ws-nazwa">{n ? nazwa(n) : w.rodzaj === 'zadanie' ? w.c.name : ''}</span>
                        <span className="ws-znaczki">
                          {w.rodzaj === 'zadanie' && <span className="ws-znaczek">w pasku zadań</span>}
                          {str.length > 0 && (
                            <span className="ws-znaczek" title={str.map((x) => x.name).join(', ')}>
                              + {str.map((x) => x.name).join(', ')}
                            </span>
                          )}
                          {n?.kind === 'fusion' && <span className="ws-znaczek">grupa · {n.parts.length}</span>}
                          {douczany ? (
                            <span className="ws-znaczek ws-nowy">douczanie</span>
                          ) : (
                            nowy && <span className="ws-znaczek ws-nowy">nowy</span>
                          )}
                          {slaby && <span className="ws-znaczek ws-slaby">słaby</span>}
                          {doPoprawy && <span className="ws-znaczek ws-poprawa">do poprawy</span>}
                        </span>
                        {c && onOtworz && (
                          <button className="ws-otworz" title="Otwórz w edytorze" onClick={() => onOtworz(c.id)}>
                            ↗
                          </button>
                        )}
                      </div>
                      {tresc(w).trim() && (
                        <div className="ws-podglad markdown-body" dangerouslySetInnerHTML={{ __html: podglad(tresc(w)) }} />
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {zaznaczone.length > 0 && (
        <div className="ws-akcje">
          <span className="przeglad-akcje-ile">Zaznaczone: {zaznaczone.length}</span>
          <button className="btn btn-primary btn-maly" onClick={nowySektor}>
            Nowy sektor
          </button>
          {tylkoSektory
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

      {menu?.rodzaj === 'wezel' && (
        <MenuNauki
          x={menu.x}
          y={menu.y}
          pathId={pathId}
          wezel={menu.n}
          cele={zaz.has(menu.n.id) && zaznaczone.length > 1 ? zaznaczone : [menu.n.id]}
          ordered={ordered}
          sektory={sektory}
          nazwaWezla={nazwa}
          onZamknij={zamknijMenu}
          onOtworz={onOtworz}
          onWybieraj={onWybieraj ?? undefined}
          doPaska={
            onWyjmijZLinii && menu.n.kind === 'block' && kafelek.get(menu.n.conceptId)?.type === typZadania
              ? async (sektorId: string) => {
                  const n = menu.n
                  if (n.kind !== 'block') return
                  await przypnijZadanie(sektorId, n.conceptId)
                  await wyjmijZSektora(sektorId, [n.id])
                  onWyjmijZLinii(n.id)
                }
              : undefined
          }
        />
      )}
      {menu?.rodzaj === 'zadanie' && (
        <MenuZadania
          x={menu.x}
          y={menu.y}
          c={menu.c}
          sektorId={menu.s.id}
          onOtworz={onOtworz}
          onDoLinii={onWstawKafelek ? doLinii : undefined}
          onZamknij={zamknijMenu}
        />
      )}
    </div>
  )
}

