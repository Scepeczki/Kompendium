import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { czytajZadania, kopiujPolecenie, otworzCzat, zlozPolecenie, type ZadanieOdCzatu } from '../czat'
import { usunZadanie, utworzZadania, wczytajZadania, zapiszZadanie, type ZadanieDoEdycji } from '../nauka'
import { useDialogs } from './Dialogs'
import type { JednostkaNauki } from '../types'

/** Jedno zadanie: nazwa, treść (widać w teście) i rozwiązanie (zakryte). */
function KartaZadania({
  z,
  nr,
  doPoprawy,
  otwarta,
  onPrzelacz,
  onZmien,
  onUsun,
}: {
  z: ZadanieDoEdycji
  nr: number
  doPoprawy: boolean
  otwarta: boolean
  onPrzelacz: () => void
  onZmien: (zmiana: Partial<Omit<ZadanieDoEdycji, 'id'>>) => void
  onUsun: () => void
}) {
  // pola edytowane lokalnie, zapis po chwili bez pisania
  const [lok, setLok] = useState(z)
  const czas = useRef<number | undefined>(undefined)
  const zmiany = useRef<Partial<Omit<ZadanieDoEdycji, 'id'>>>({})
  useEffect(() => () => {
    window.clearTimeout(czas.current)
    if (Object.keys(zmiany.current).length) onZmien(zmiany.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pisz = (pole: keyof Omit<ZadanieDoEdycji, 'id'>, w: string) => {
    setLok((x) => ({ ...x, [pole]: w }))
    zmiany.current = { ...zmiany.current, [pole]: w }
    window.clearTimeout(czas.current)
    czas.current = window.setTimeout(() => {
      onZmien(zmiany.current)
      zmiany.current = {}
    }, 500)
  }
  return (
    <li className={`ez-zadanie ${otwarta ? 'otwarta' : ''} ${doPoprawy ? 'do-poprawy' : ''}`} data-zadanie={z.id}>
      <div className="ez-zadanie-glowa">
        <span className="ez-nr">{nr}</span>
        {otwarta ? (
          <input
            className="ez-nazwa-pole"
            value={lok.nazwa}
            placeholder="Nazwa zadania"
            onChange={(e) => pisz('nazwa', e.target.value)}
          />
        ) : (
          <button className="ez-nazwa" onClick={onPrzelacz}>
            {lok.nazwa || 'Zadanie'}
            {!lok.tresc.trim() && <span className="hint"> — bez treści</span>}
          </button>
        )}
        {doPoprawy && <span className="ez-poprawa">do poprawy</span>}
        <button className="btn btn-link" onClick={onPrzelacz}>
          {otwarta ? 'Zwiń' : 'Edytuj'}
        </button>
        <button className="btn btn-link ez-usun" title="Usuń to zadanie (zapyta)" onClick={onUsun}>
          Usuń
        </button>
      </div>
      {otwarta && (
        <div className="ez-pola">
          <label>
            <span className="sesja-etykieta">Treść — widać ją w teście</span>
            <textarea
              className="sesja-pole"
              rows={4}
              autoFocus={!lok.tresc}
              value={lok.tresc}
              placeholder="Treść zadania"
              onChange={(e) => pisz('tresc', e.target.value)}
            />
          </label>
          <label>
            <span className="sesja-etykieta">Rozwiązanie — w teście zakryte</span>
            <textarea
              className="sesja-pole"
              rows={4}
              value={lok.rozwiazanie}
              placeholder="Metoda i kluczowe kroki"
              onChange={(e) => pisz('rozwiazanie', e.target.value)}
            />
          </label>
        </div>
      )}
    </li>
  )
}

/** Etap zadań powtórki zero: dodajesz zadania (sam albo od czatu), potem
 *  test zakryty z zadaniami. Bez zadań — „Pomiń zadania" i test i tak jest.
 *  `proba` — zadania tylko w pamięci, nic się nie zapisuje. */
export function EtapZadan({
  j,
  proba,
  onTest,
}: {
  j: JednostkaNauki
  proba?: boolean
  onTest: () => void
}) {
  const dlg = useDialogs()
  const zBazy = useLiveQuery(() => (proba ? Promise.resolve([]) : wczytajZadania(j.zadania ?? [])), [proba, (j.zadania ?? []).join()])
  const [lokalne, setLokalne] = useState<ZadanieDoEdycji[]>([])
  const zadania = proba ? lokalne : (zBazy ?? [])
  const [otwarte, setOtwarte] = useState<Set<string>>(new Set())
  const [tekst, setTekst] = useState<string | null>(null)
  const [wklejone, setWklejone] = useState('')
  const [wybrane, setWybrane] = useState<Set<number>>(new Set())
  const odczytane = useMemo<ZadanieOdCzatu[]>(() => (wklejone.trim() ? czytajZadania(wklejone) : []), [wklejone])
  useEffect(() => setWybrane(new Set(odczytane.map((_, i) => i))), [odczytane])
  const poprawki = new Set(j.doPoprawy ?? [])

  const przelacz = (id: string) =>
    setOtwarte((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const dodaj = async (lista: { nazwa?: string; tresc?: string; rozwiazanie?: string }[], otworz: boolean) => {
    if (proba) {
      const nowe = lista.map((z, i) => ({
        id: `proba-${Date.now()}-${i}`,
        nazwa: z.nazwa ?? `Zadanie ${lokalne.length + i + 1}`,
        tresc: z.tresc ?? '',
        rozwiazanie: z.rozwiazanie ?? '',
      }))
      setLokalne((l) => [...l, ...nowe])
      if (otworz) setOtwarte((s) => new Set([...s, ...nowe.map((z) => z.id)]))
      return
    }
    const ids = await utworzZadania(j.id, lista)
    if (otworz) setOtwarte((s) => new Set([...s, ...ids]))
  }

  const zmien = (id: string, zmiana: Partial<Omit<ZadanieDoEdycji, 'id'>>) => {
    if (proba) setLokalne((l) => l.map((z) => (z.id === id ? { ...z, ...zmiana } : z)))
    else void zapiszZadanie(id, zmiana)
  }

  const usun = async (z: ZadanieDoEdycji) => {
    const ok = await dlg.confirm({
      title: `Usunąć zadanie „${z.nazwa || 'Zadanie'}"?`,
      message: proba ? 'To tylko próba — nic się nie zapisuje.' : 'Kafelek zniknie razem z treścią i rozwiązaniem.',
      confirmLabel: 'Usuń zadanie',
      danger: true,
    })
    if (!ok) return
    if (proba) setLokalne((l) => l.filter((x) => x.id !== z.id))
    else await usunZadanie(j.id, z.id)
  }

  const zloz = async () => {
    let t = await zlozPolecenie(j, { rodzaj: 'zadania' })
    // w próbie czat ma też widzieć zadania dodane „na niby"
    if (proba && lokalne.length) {
      const dopisane = lokalne.map((z) => `  - ${z.nazwa}${z.tresc ? `: ${z.tresc.replace(/\s+/g, ' ').slice(0, 400)}` : ''}`).join('\n')
      t = t.replace('  (jeszcze nie ma żadnych)', dopisane)
    }
    setTekst(t)
    return t
  }

  return (
    <div className="etap-zadan">
      <section className="ez-sekcja">
        <h4 className="tc-tytul">Zadania sektora{zadania.length ? ` (${zadania.length})` : ''}</h4>
        {zadania.length > 0 ? (
          <ol className="ez-lista">
            {zadania.map((z, i) => (
              <KartaZadania
                key={z.id}
                z={z}
                nr={i + 1}
                doPoprawy={poprawki.has(z.id)}
                otwarta={otwarte.has(z.id)}
                onPrzelacz={() => przelacz(z.id)}
                onZmien={(zm) => zmien(z.id, zm)}
                onUsun={() => void usun(z)}
              />
            ))}
          </ol>
        ) : (
          <p className="hint">Jeszcze nie ma zadań. Dodaj własne albo poproś czat.</p>
        )}
        <button className="btn ez-plus" onClick={() => void dodaj([{}], true)} data-nowe-zadanie>
          + Nowe zadanie
        </button>
      </section>

      <section className="ez-sekcja">
        <h4 className="tc-tytul">Zadania od czatu</h4>
        <div className="tc-krok">
          <span className="test-czatem-nr">1</span>
          <div className="tc-krok-tresc">
            <strong>Poproś czat o nowe zadania</strong>
            <span className="hint">Polecenie zawiera materiał sektora i wszystkie jego dotychczasowe zadania — czat ich nie powtórzy.</span>
            <div className="tc-przyciski">
              <button className="btn btn-primary" onClick={async () => void otworzCzat(await zloz())}>
                Zadania: kopiuj i otwórz czat
              </button>
              <button className="btn" onClick={async () => void kopiujPolecenie(await zloz())}>
                Tylko kopiuj
              </button>
            </div>
            {tekst !== null && (
              <details className="test-czatem-polecenie">
                <summary>Pokaż polecenie</summary>
                <textarea readOnly value={tekst} rows={10} onFocus={(e) => e.target.select()} />
              </details>
            )}
          </div>
        </div>
        <div className="tc-krok">
          <span className="test-czatem-nr">2</span>
          <div className="tc-krok-tresc">
            <strong>Wklej odpowiedź czatu</strong>
            {proba && (
              <div className="test-czatem-przyklady">
                <span className="hint">Próba — gotowa odpowiedź:</span>
                <button className="btn btn-maly" onClick={() => setWklejone(PRZYKLAD_ZADAN)}>
                  Dwa zadania od czatu
                </button>
              </div>
            )}
            <textarea
              className="sesja-pole ez-wklej"
              rows={4}
              placeholder="Czat poda zadania w ramce (ZADANIE, TREŚĆ, ROZWIĄZANIE). Skopiuj całość i wklej tutaj."
              value={wklejone}
              onChange={(e) => setWklejone(e.target.value)}
            />
            {wklejone.trim() && !odczytane.length && (
              <span className="hint">Nie widzę zadań — czat powinien podać je według wzoru (ZADANIE, TREŚĆ, ROZWIĄZANIE).</span>
            )}
            {odczytane.length > 0 && (
              <>
                <ul className="ez-od-czatu">
                  {odczytane.map((z, i) => (
                    <li key={i}>
                      <label>
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
                        <strong>{z.nazwa}</strong>
                      </label>
                      <span className="ez-podglad">{z.tresc}</span>
                      {!z.rozwiazanie && <span className="hint">bez rozwiązania — dopiszesz je sam</span>}
                    </li>
                  ))}
                </ul>
                <div className="tc-przyciski">
                  <button
                    className="btn btn-primary"
                    disabled={!wybrane.size}
                    data-dodaj-od-czatu
                    onClick={async () => {
                      await dodaj(
                        odczytane.filter((_, i) => wybrane.has(i)),
                        false,
                      )
                      setWklejone('')
                    }}
                  >
                    Dodaj zaznaczone ({wybrane.size})
                  </button>
                  <span className="hint">Odznacz te, które ci się nie podobają.</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="ez-koniec">
        {proba ? (
          <p className="settings-hint settings-status">
            W prawdziwej nauce teraz: {zadania.length ? `test zakryty z zadaniami (${zadania.length})` : 'test zakryty bez zadań'} —
            potem koniec powtórki zero.
          </p>
        ) : zadania.length ? (
          <button className="btn btn-primary" onClick={onTest} data-test-koncowy>
            Zapisz — test zakryty z zadaniami ({zadania.length})
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onTest} data-test-koncowy>
            Pomiń zadania — test zakryty
          </button>
        )}
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
---
ZADANIE: Czy zbiór jest otwarty?
TREŚĆ:
Czy przedział [0, 1) jest otwarty w R? Uzasadnij.
ROZWIĄZANIE:
Nie: punkt 0 nie ma kuli zawartej w zbiorze. Metoda: sprawdź warunek z definicji w punktach brzegowych.
\`\`\``
