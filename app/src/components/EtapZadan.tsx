import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { adresCzatu, czatWybrany, CZATY, czytajZadania, kopiujPolecenie, otworzCzat, zlozPolecenie, type ZadanieOdCzatu } from '../czat'
import {
  dodajRozwiazanie,
  nazwaRozwiazania,
  usunRozwiazanie,
  usunZadanie,
  utworzZadania,
  wczytajZadania,
  zapiszRozwiazanie,
  zapiszZadanie,
  znajdzTypZadania,
  type ZadanieDoEdycji,
} from '../nauka'
import { useBlockTypes } from '../blockTypes'
import { renderMarkdown } from '../markdown'
import { useDialogs } from './Dialogs'
import { RichEditor } from './RichEditor'
import { Etapy } from './TestCzatem'
import type { JednostkaNauki } from '../types'

const nazwaCzatu = () => CZATY.find((c) => c.id === czatWybrany())?.nazwa ?? new URL(adresCzatu()).host

/** Zapis z opóźnieniem: pisze się płynnie, a do bazy idzie po chwili bez
 *  pisania (i na pewno przy zmianie zadania albo strony). */
function useZapisPoChwili(zapisz: (klucz: string, w: string) => void) {
  const czekajace = useRef(new Map<string, string>())
  const czas = useRef<number | undefined>(undefined)
  const zapiszRef = useRef(zapisz)
  zapiszRef.current = zapisz
  const zywy = useRef(true)
  const wypchnij = () => {
    window.clearTimeout(czas.current)
    for (const [k, w] of czekajace.current) zapiszRef.current(k, w)
    czekajace.current.clear()
  }
  useEffect(() => {
    zywy.current = true
    return () => {
      wypchnij()
      zywy.current = false
    }
  }, [])
  return {
    pisz: (klucz: string, w: string) => {
      // edytor potrafi zgłosić „zmianę" jeszcze przy zamykaniu — wtedy już nic nie zapisujemy
      if (!zywy.current) return
      czekajace.current.set(klucz, w)
      window.clearTimeout(czas.current)
      czas.current = window.setTimeout(wypchnij, 500)
    },
    wypchnij,
  }
}

/** Schemat kafelka-zadania: nazwa, strona „Polecenie" (widać ją w teście)
 *  i strony z rozwiązaniami (w teście zakryte) — można ich mieć kilka. */
function SchematZadania({
  z,
  nowe,
  doPoprawy,
  znak,
  kolor,
  onNazwa,
  onTresc,
  onRozwiazanie,
  onDodajRozwiazanie,
  onUsunRozwiazanie,
  onUsun,
}: {
  z: ZadanieDoEdycji
  nowe: boolean
  doPoprawy: boolean
  znak: string
  kolor: string
  onNazwa: (t: string) => void
  onTresc: (t: string) => void
  onRozwiazanie: (stronaId: string, t: string) => void
  onDodajRozwiazanie: () => Promise<string | undefined>
  onUsunRozwiazanie: (stronaId: string) => void
  onUsun: () => void
}) {
  const [strona, setStrona] = useState<string>('polecenie')
  const [nazwa, setNazwa] = useState(z.nazwa)
  const [zapis, setZapis] = useState<'zapisano' | 'pisze'>('zapisano')
  const czas = useRef<number | undefined>(undefined)
  const zaznacz = () => {
    setZapis('pisze')
    window.clearTimeout(czas.current)
    czas.current = window.setTimeout(() => setZapis('zapisano'), 700)
  }
  const r = z.rozwiazania.find((x) => x.id === strona)
  const naPoleceniu = strona === 'polecenie' || !r
  return (
    <article className="ez2-kafelek" data-zadanie-edycja={z.id} style={{ '--typ': kolor } as CSSProperties}>
      <div className="ez2-kafelek-glowa">
        <span className="ez2-typ">{znak}</span>
        <input
          className="ez2-tytul ez-nazwa-pole"
          value={nazwa}
          autoFocus={nowe}
          placeholder="Nazwa zadania"
          aria-label="Nazwa zadania"
          onChange={(e) => {
            setNazwa(e.target.value)
            onNazwa(e.target.value)
            zaznacz()
          }}
        />
        {doPoprawy && <span className="tcz-r tcz-r-nie">do poprawy</span>}
        <span className="ez2-zapis">{zapis === 'zapisano' ? 'zapisano' : 'zapisuję…'}</span>
        <button className="tcz-link ez-usun" title="Usuń to zadanie (zapyta)" onClick={onUsun}>
          Usuń
        </button>
      </div>
      <div className="ez2-strony" role="tablist">
        <button
          role="tab"
          aria-selected={naPoleceniu}
          className={`ez2-strona ${naPoleceniu ? 'wl' : ''}`}
          onClick={() => setStrona('polecenie')}
          data-strona="polecenie"
        >
          Polecenie
        </button>
        {z.rozwiazania.map((x) => (
          <span key={x.id} className={`ez2-strona-wrap ${strona === x.id ? 'wl' : ''}`}>
            <button
              role="tab"
              aria-selected={strona === x.id}
              className={`ez2-strona ${strona === x.id ? 'wl' : ''}`}
              onClick={() => setStrona(x.id)}
              data-strona="rozwiazanie"
            >
              {x.nazwa}
            </button>
            {strona === x.id && (
              <button
                className="ez2-strona-usun"
                title={`Usuń stronę „${x.nazwa}" (zapyta)`}
                aria-label={`Usuń stronę ${x.nazwa}`}
                onClick={() => {
                  onUsunRozwiazanie(x.id)
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          className="ez2-strona ez2-strona-plus"
          data-dodaj-rozwiazanie
          title="Kolejne rozwiązanie — np. inną metodą"
          onClick={async () => {
            const id = await onDodajRozwiazanie()
            if (id) setStrona(id)
          }}
        >
          + rozwiązanie
        </button>
      </div>
      <p className="ez2-strona-opis">
        {naPoleceniu
          ? 'Polecenie widać w teście — napisz je tak, żeby dało się zacząć bez zaglądania gdzie indziej.'
          : 'W teście zakryte. O metodę tu chodzi: pomysł i kluczowe kroki, dlaczego to działa.'}
      </p>
      <div className="ez2-edytor">
        <RichEditor
          key={`${z.id}-${naPoleceniu ? 'polecenie' : r!.id}`}
          value={naPoleceniu ? z.tresc : r!.tresc}
          editable
          ruler={false}
          placeholder={naPoleceniu ? 'Polecenie zadania' : 'Rozwiązanie: metoda i kluczowe kroki'}
          onChange={(md) => {
            // bez prawdziwej zmiany (edytor normalizuje treść przy otwarciu) — nic nie zapisujemy
            if (md === (naPoleceniu ? z.tresc : r!.tresc)) return
            if (naPoleceniu) onTresc(md)
            else onRozwiazanie(r!.id, md)
            zaznacz()
          }}
        />
      </div>
    </article>
  )
}

/** Zadania od czatu: polecenie (czat najpierw daje same zadania, ty
 *  rozwiązujesz, on poprawia, na końcu blok kodu), wklejenie, podgląd
 *  rozpoznanych kafelków i „Dodaj do zadań". */
function ZadaniaZCzatem({
  znak,
  kolor,
  proba,
  zloz,
  onDodaj,
}: {
  znak: string
  kolor: string
  proba: boolean
  zloz: () => Promise<string>
  onDodaj: (l: ZadanieOdCzatu[]) => Promise<void>
}) {
  const [tekst, setTekst] = useState<string | null>(null)
  const [wklejone, setWklejone] = useState('')
  const [wybrane, setWybrane] = useState<Set<number>>(new Set())
  const odczytane = useMemo<ZadanieOdCzatu[]>(() => (wklejone.trim() ? czytajZadania(wklejone) : []), [wklejone])
  useEffect(() => setWybrane(new Set(odczytane.map((_, i) => i))), [odczytane])
  const pobierz = async () => {
    const t = await zloz()
    setTekst(t)
    return t
  }
  const skopiowane = tekst !== null
  return (
    <div className="tcz ez2-czat">
      <div className="tcz-glowa">
        <h1 className="tcz-h1">Zadania z czatem</h1>
        <p className="tcz-pod">
          Czat ułoży nowe zadania do tego sektora — inne niż te, które już są — i przerobi je z tobą.
        </p>
      </div>
      <div className="tcz-kroki">
        <div className={`tcz-karta tcz-krok tcz-krok-czat ${skopiowane ? 'zrobiony' : 'teraz'}`}>
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">{skopiowane ? '✓' : 1}</span>
            <b>Otwórz czat</b>
          </div>
          <button className="btn btn-primary tcz-otworz" onClick={async () => void otworzCzat(await pobierz())}>
            Kopiuj polecenie i otwórz {nazwaCzatu()}
          </button>
          <button className="tcz-link" onClick={async () => void kopiujPolecenie(await pobierz())}>
            Tylko kopiuj
          </button>
          {tekst !== null && (
            <details className="test-czatem-polecenie">
              <summary>Pokaż polecenie</summary>
              <textarea readOnly value={tekst} rows={10} onFocus={(e) => e.target.select()} />
            </details>
          )}
        </div>
        <div className={`tcz-karta tcz-krok ${skopiowane ? 'teraz' : ''}`}>
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">2</span>
            <b>Rozwiązuj z czatem</b>
          </div>
          <p className="tcz-szary">
            Czat najpierw poda <strong>same polecenia</strong> — bez odpowiedzi. Rozwiązujesz, wysyłasz mu
            swoje rozwiązania, a on je poprawia albo uznaje.
          </p>
        </div>
        <div className="tcz-karta tcz-krok">
          <div className="tcz-krok-glowa">
            <span className="tcz-nr">3</span>
            <b>Wklej kod od czatu</b>
          </div>
          <p className="tcz-szary">
            Na końcu czat poda blok kodu z zadaniami (ZADANIE, TREŚĆ, ROZWIĄZANIE). Skopiuj go i wklej
            poniżej.
          </p>
        </div>
      </div>
      <div className="tcz-wklej duze">
        <textarea
          className="tcz-pole-wklej ez-wklej"
          aria-label="Kod z zadaniami od czatu"
          rows={5}
          placeholder={'Wklej tutaj — Ctrl+V\n\nBlok kodu z końca rozmowy: ZADANIE, TREŚĆ, ROZWIĄZANIE.'}
          value={wklejone}
          onChange={(e) => setWklejone(e.target.value)}
        />
        {proba && (
          <div className="test-czatem-przyklady">
            <span className="tcz-szary">Próba — wstaw gotowy kod:</span>
            <button className="btn btn-maly" onClick={() => setWklejone(PRZYKLAD_ZADAN)}>
              Dwa zadania od czatu
            </button>
          </div>
        )}
      </div>
      {wklejone.trim() && !odczytane.length && (
        <p className="tcz-karta tcz-pusto">
          Nie widzę zadań. Czat powinien podać je w bloku kodu według wzoru: ZADANIE, TREŚĆ, ROZWIĄZANIE.
        </p>
      )}
      {odczytane.length > 0 && (
        <section className="ez2-rozpoznane">
          <div className="tcz-glowa tcz-glowa-rzad">
            <div>
              <h2 className="ez2-h2">
                Rozpoznane: {odczytane.length} {odczytane.length === 1 ? 'zadanie' : odczytane.length < 5 ? 'zadania' : 'zadań'}
              </h2>
              <p className="tcz-szary">Tak zostaną dodane — jako kafelki-zadania. Odznacz te, których nie chcesz.</p>
            </div>
          </div>
          <ul className="ez-od-czatu ez2-podglad">
            {odczytane.map((z, i) => (
              <li key={i} className={`ez2-mini ${wybrane.has(i) ? 'wl' : ''}`} style={{ '--typ': kolor } as CSSProperties}>
                <label className="ez2-mini-glowa">
                  <input
                    type="checkbox"
                    checked={wybrane.has(i)}
                    onChange={() =>
                      setWybrane((s) => {
                        const n = new Set(s)
                        if (n.has(i)) n.delete(i)
                        else n.add(i)
                        return n
                      })
                    }
                  />
                  <span className="ez2-typ">{znak}</span>
                  <strong>{z.nazwa}</strong>
                </label>
                <div className="ez2-mini-strona">
                  <span className="tcz-lbl">Polecenie</span>
                  <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(z.tresc || '_(puste)_') }} />
                </div>
                <div className="ez2-mini-rozw">
                  {z.rozwiazania.length ? (
                    z.rozwiazania.map((_, k) => (
                      <span key={k} className="tcz-r tcz-r-tak">
                        ✓ {nazwaRozwiazania(k)}
                      </span>
                    ))
                  ) : (
                    <span className="tcz-r tcz-r-czesciowo">bez rozwiązania — dopiszesz sam</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="tcz-przyciski">
            <button
              className="btn btn-primary"
              disabled={!wybrane.size}
              data-dodaj-od-czatu
              onClick={async () => {
                await onDodaj(odczytane.filter((_, i) => wybrane.has(i)))
                setWklejone('')
              }}
            >
              Dodaj do zadań ({wybrane.size})
            </button>
            <button className="tcz-link" onClick={() => setWklejone('')}>
              Wklej ponownie
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

/** Ekran zadań sektora. Z lewej lista zadań i „Dołóż" (zadanie albo z czatem),
 *  pośrodku schemat wybranego kafelka-zadania albo zadania z czatem, na dole
 *  dalej: test zakryty z zadaniami (albo „Pomiń zadania"). Ekran działa też po
 *  nauce sektora — nowe zadania trafiają wtedy do „Doucz nowe".
 *  `proba` — zadania tylko w pamięci, nic się nie zapisuje. */
export function EtapZadan({
  j,
  proba,
  onTest,
  onGotowe,
}: {
  j: JednostkaNauki
  proba?: boolean
  onTest: () => void
  onGotowe?: () => void
}) {
  const dlg = useDialogs()
  const typy = useBlockTypes()
  const typZad = znajdzTypZadania(typy.all)
  const def = typy.all.find((t) => t.id === typZad)
  const znak = def?.short ?? 'ZAD'
  const kolor = def?.color ?? 'var(--accent)'
  const zBazy = useLiveQuery(() => (proba ? Promise.resolve([]) : wczytajZadania(j.zadania ?? [])), [proba, (j.zadania ?? []).join()])
  const [lokalne, setLokalne] = useState<ZadanieDoEdycji[]>([])
  const zadania = proba ? lokalne : (zBazy ?? [])
  /** Co jest pośrodku: id zadania albo „czat". */
  const [widok, setWidok] = useState<string | null>(null)
  const [nowy, setNowy] = useState<string | null>(null)
  const poprawki = new Set(j.doPoprawy ?? [])
  const wybrane = zadania.find((z) => z.id === widok) ?? (widok === 'czat' ? undefined : zadania[0])

  const zmienLok = (id: string, f: (z: ZadanieDoEdycji) => ZadanieDoEdycji) =>
    setLokalne((l) => l.map((z) => (z.id === id ? f(z) : z)))
  const zapis = useZapisPoChwili((klucz, w) => {
    if (proba) return
    const [rodzaj, id] = [klucz.slice(0, 1), klucz.slice(2)]
    if (rodzaj === 'n') void zapiszZadanie(id, { nazwa: w })
    else if (rodzaj === 't') void zapiszZadanie(id, { tresc: w })
    else void zapiszRozwiazanie(id, w)
  })

  const dodaj = async (lista: { nazwa?: string; tresc?: string; rozwiazania?: string[] }[]): Promise<string[]> => {
    zapis.wypchnij()
    if (proba) {
      const t = Date.now()
      const nowe = lista.map((z, i) => ({
        id: `proba-${t}-${i}`,
        nazwa: z.nazwa ?? `Zadanie ${lokalne.length + i + 1}`,
        tresc: z.tresc ?? '',
        rozwiazania: (z.rozwiazania?.length ? z.rozwiazania : ['']).map((r, k) => ({
          id: `proba-${t}-${i}-r${k}`,
          nazwa: nazwaRozwiazania(k),
          tresc: r,
        })),
      }))
      setLokalne((l) => [...l, ...nowe])
      return nowe.map((z) => z.id)
    }
    return utworzZadania(j.id, lista)
  }

  const nowe = async () => {
    const [id] = await dodaj([{}])
    if (id) {
      setWidok(id)
      setNowy(id)
    }
  }

  const usun = async (z: ZadanieDoEdycji) => {
    const ok = await dlg.confirm({
      title: `Usunąć zadanie „${z.nazwa || 'Zadanie'}"?`,
      message: proba ? 'To tylko próba — nic się nie zapisuje.' : 'Kafelek zniknie razem z poleceniem i rozwiązaniami.',
      confirmLabel: 'Usuń zadanie',
      danger: true,
    })
    if (!ok) return
    zapis.wypchnij()
    if (proba) setLokalne((l) => l.filter((x) => x.id !== z.id))
    else await usunZadanie(j.id, z.id)
    setWidok(null)
  }

  const usunStrone = async (z: ZadanieDoEdycji, stronaId: string) => {
    const r = z.rozwiazania.find((x) => x.id === stronaId)
    const ok = await dlg.confirm({
      title: `Usunąć stronę „${r?.nazwa ?? 'Rozwiązanie'}"?`,
      message: proba ? 'To tylko próba — nic się nie zapisuje.' : 'Zniknie to rozwiązanie; zadanie i reszta stron zostają.',
      confirmLabel: 'Usuń stronę',
      danger: true,
    })
    if (!ok) return
    zapis.wypchnij()
    if (proba) zmienLok(z.id, (x) => ({ ...x, rozwiazania: x.rozwiazania.filter((y) => y.id !== stronaId) }))
    else await usunRozwiazanie(stronaId)
  }

  const zloz = async () => {
    zapis.wypchnij()
    let t = await zlozPolecenie(j, { rodzaj: 'zadania' })
    // w próbie czat ma też widzieć zadania dodane „na niby"
    if (proba && lokalne.length) {
      const dopisane = lokalne.map((z) => `  - ${z.nazwa}${z.tresc ? `: ${z.tresc.replace(/\s+/g, ' ').slice(0, 400)}` : ''}`).join('\n')
      t = t.replace('  (jeszcze nie ma żadnych)', dopisane)
    }
    return t
  }

  const wPowtorceZero = j.etap === 'zadania'
  return (
    <div className="ez2-ekran">
      {wPowtorceZero && (
        <div className="tcz">
          <Etapy teraz={4} />
        </div>
      )}
      {!!j.doPoprawy?.length && wPowtorceZero && (
        <p className="tcz-karta ez2-uwaga sesja-uwaga-poprawa">
          Test zakryty nie wyszedł — popraw zaznaczone ({j.doPoprawy.length}) i zrób go jeszcze raz.
        </p>
      )}
      <div className="ez2 etap-zadan">
        <aside className="ez2-lewa" aria-label="Zadania sektora">
          <span className="tcz-lbl">Zadania sektora{zadania.length ? ` · ${zadania.length}` : ''}</span>
          {zadania.length > 0 ? (
            <ol className="ez2-lista">
              {zadania.map((z, i) => (
                <li key={z.id}>
                  <button
                    className={`ez2-poz ${wybrane?.id === z.id && widok !== 'czat' ? 'wl' : ''} ${poprawki.has(z.id) ? 'do-poprawy' : ''}`}
                    data-zadanie={z.id}
                    onClick={() => {
                      zapis.wypchnij()
                      setWidok(z.id)
                      setNowy(null)
                    }}
                  >
                    <span className="ez2-nr">{i + 1}</span>
                    <span className="ez2-poz-nazwa">{z.nazwa || 'Zadanie'}</span>
                    {poprawki.has(z.id) && <span className="ez2-poz-znak">do poprawy</span>}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="tcz-szary ez2-brak">Jeszcze nie ma zadań w tym sektorze.</p>
          )}
          <div className="ez2-doloz">
            <span className="tcz-lbl">Dołóż</span>
            <button className="btn btn-dolacz ez2-doloz-btn" onClick={() => void nowe()} data-nowe-zadanie>
              <span className="ez2-typ" style={{ '--typ': kolor } as CSSProperties}>
                {znak}
              </span>
              Zadanie
            </button>
            <button
              className={`btn btn-dolacz ez2-doloz-btn ${widok === 'czat' ? 'btn-active' : ''}`}
              onClick={() => {
                zapis.wypchnij()
                setWidok('czat')
              }}
              data-z-czatem
            >
              <span className="ez2-czat-znak" aria-hidden>
                ✦
              </span>
              Z czatem
            </button>
          </div>
        </aside>
        <section className="ez2-glowna">
          {widok === 'czat' ? (
            <ZadaniaZCzatem
              znak={znak}
              kolor={kolor}
              proba={!!proba}
              zloz={zloz}
              onDodaj={async (l) => {
                const ids = await dodaj(l.map((z) => ({ nazwa: z.nazwa, tresc: z.tresc, rozwiazania: z.rozwiazania })))
                window.dispatchEvent(
                  new CustomEvent('komp:komunikat', { detail: `Dodane do zadań: ${ids.length}` }),
                )
                if (ids[0]) setWidok(ids[0])
              }}
            />
          ) : wybrane ? (
            <SchematZadania
              key={wybrane.id}
              z={wybrane}
              nowe={nowy === wybrane.id}
              doPoprawy={poprawki.has(wybrane.id)}
              znak={znak}
              kolor={kolor}
              onNazwa={(t) => (proba ? zmienLok(wybrane.id, (x) => ({ ...x, nazwa: t })) : zapis.pisz(`n:${wybrane.id}`, t))}
              onTresc={(t) => (proba ? zmienLok(wybrane.id, (x) => ({ ...x, tresc: t })) : zapis.pisz(`t:${wybrane.id}`, t))}
              onRozwiazanie={(sid, t) =>
                proba
                  ? zmienLok(wybrane.id, (x) => ({ ...x, rozwiazania: x.rozwiazania.map((y) => (y.id === sid ? { ...y, tresc: t } : y)) }))
                  : zapis.pisz(`r:${sid}`, t)
              }
              onDodajRozwiazanie={async () => {
                zapis.wypchnij()
                if (proba) {
                  const id = `proba-r-${Date.now()}`
                  zmienLok(wybrane.id, (x) => ({
                    ...x,
                    rozwiazania: [...x.rozwiazania, { id, nazwa: nazwaRozwiazania(x.rozwiazania.length), tresc: '' }],
                  }))
                  return id
                }
                return dodajRozwiazanie(wybrane.id)
              }}
              onUsunRozwiazanie={(sid) => void usunStrone(wybrane, sid)}
              onUsun={() => void usun(wybrane)}
            />
          ) : (
            <div className="ez2-pusto">
              <h1 className="tcz-h1">Zadania sektora</h1>
              <p className="tcz-pod">
                Dołóż zadanie sam albo z czatem. Polecenie widać w teście, rozwiązanie jest zakryte — tak
                sprawdzisz metodę, nie tylko definicje.
              </p>
              <div className="ez2-pusto-przyciski">
                <button className="ez2-plus-duzy" onClick={() => void nowe()}>
                  <span className="ez2-plus-znak">+</span>
                  <b>Nowe zadanie</b>
                  <span className="tcz-szary">Polecenie i rozwiązanie (albo kilka rozwiązań)</span>
                </button>
                <button className="ez2-plus-duzy" onClick={() => setWidok('czat')}>
                  <span className="ez2-plus-znak">✦</span>
                  <b>Z czatem</b>
                  <span className="tcz-szary">Czat da zadania, ty rozwiązujesz, on poprawia</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      <div className="tcz tcz-stopka-wrap">
        <div className="tcz-stopka ez-koniec">
          {proba ? (
            <p className="settings-hint settings-status">
              W prawdziwej nauce teraz: {zadania.length ? `test zakryty z zadaniami (${zadania.length})` : 'test zakryty bez zadań'} —
              potem koniec powtórki zero.
            </p>
          ) : wPowtorceZero ? (
            <>
              <span className="tcz-werdykt-co ez2-stopka-opis">
                {zadania.length
                  ? `Dalej test zakryty: kafelki sektora i zadania (${zadania.length}) — polecenie widać, rozwiązanie zakryte.`
                  : 'Bez zadań tym razem — test zakryty samych kafelków i koniec powtórki zero.'}
              </span>
              <button
                className="btn btn-primary tcz-zapisz"
                onClick={() => {
                  zapis.wypchnij()
                  onTest()
                }}
                data-test-koncowy
              >
                {zadania.length ? `Zapisz — test zakryty z zadaniami (${zadania.length})` : 'Pomiń zadania — test zakryty'}
              </button>
            </>
          ) : (
            <>
              <span className="tcz-werdykt-co ez2-stopka-opis">
                {j.etap === 'powtorki'
                  ? 'Sektor jest już nauczony: nowe zadania pojawią się przy nim jako „Doucz nowe" — mapujesz tylko je, przerwa i test tylko z nich. Termin sektora zostaje.'
                  : 'Zadania zostają w sektorze — nauczysz się ich razem z nim.'}
              </span>
              <button
                className="btn btn-primary tcz-zapisz"
                onClick={() => {
                  zapis.wypchnij()
                  onGotowe?.()
                }}
                data-gotowe-zadania
              >
                Gotowe
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const PRZYKLAD_ZADAN = `\`\`\`
ZADANIE: Kula w metryce dyskretnej
TREŚĆ:
Opisz kulę o promieniu 1/2 i kulę o promieniu 2 w metryce dyskretnej.
ROZWIĄZANIE:
Metoda: podstaw definicję metryki dyskretnej do definicji kuli. Promień 1/2 — tylko środek; promień 2 — cała przestrzeń.
ROZWIĄZANIE 2:
Z rysunku: odległość to 0 albo 1, więc kula „przeskakuje" od punktu do całości przy promieniu 1.
---
ZADANIE: Czy zbiór jest otwarty?
TREŚĆ:
Czy przedział [0, 1) jest otwarty w R? Uzasadnij.
ROZWIĄZANIE:
Nie: punkt 0 nie ma kuli zawartej w zbiorze. Metoda: sprawdź warunek z definicji w punktach brzegowych.
\`\`\``
