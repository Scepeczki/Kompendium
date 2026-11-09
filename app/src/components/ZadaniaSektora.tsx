import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { BlockShell } from './BlockShell'
import { Icon } from './Icon'
import { CZATY, adresCzatu, czatWybrany, otworzCzat, podzielZadania, zlozPolecenie } from '../czat'
import { naprawTypZadan, odepnijZadanie, przesunZadanie, utworzZadania } from '../nauka'
import { wez } from '../naukaUstawienia'
import type { Concept, JednostkaNauki } from '../types'

/** Zadania sektora, które wciąż istnieją — kafelek mógł zostać usunięty
 *  w bibliotece, a sektor pamięta tylko jego id. */
export function useZadania(j: JednostkaNauki | undefined): Concept[] | undefined {
  const ids = j?.zadania ?? []
  // zadania z rodzajem, którego nie ma (szare), dostają rodzaj „Zadanie"
  useEffect(() => {
    void naprawTypZadan(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join()])
  return useLiveQuery(async () => {
    const cs = await db.concepts.bulkGet(ids)
    return cs.filter((c): c is Concept => !!c)
  }, [ids.join()])
}

const nazwaCzatu = () => CZATY.find((c) => c.id === czatWybrany())?.nazwa ?? new URL(adresCzatu()).host

/** Zadania sektora w panelu Nauki: lista, nowe zadanie, generowanie czatem. */
export function ListaZadan({
  j,
  onOtworz,
}: {
  j: JednostkaNauki
  onOtworz?: (conceptId: string) => void
}) {
  const zadania = useZadania(j) ?? []
  const [generuj, setGeneruj] = useState(false)
  const poprawki = new Set(j.doPoprawy ?? [])

  const nowe = async () => {
    const [id] = await utworzZadania(j.id, [{}])
    if (id) onOtworz?.(id)
  }

  return (
    <div className="zadania-sektora">
      <h4 className="zadania-sektora-glowa">
        Zadania{zadania.length ? ` (${zadania.length})` : ''}
      </h4>
      {zadania.length === 0 && (
        <p className="hint">
          Zadanie to kafelek rodzaju „Zadanie" ze stronami Treść i Rozwiązanie. Mieszka w folderze ścieżki, a w Linii
          stoi w zwiniętym pasku na końcu sektora (nie trafia do Skryptu ani PDF). W teście widać treść,
          a rozwiązanie odtwarzasz z pamięci — chodzi o pomysł i tok rozumowania, nie o liczenie.
        </p>
      )}
      {zadania.length > 0 && (
        <ol className="zadania-lista">
          {zadania.map((c, i) => (
            <li key={c.id} className={poprawki.has(c.id) ? 'do-poprawy' : ''}>
              <button className="zadania-nazwa" title="Otwórz w edytorze" onClick={() => onOtworz?.(c.id)}>
                {c.name}
              </button>
              <span className="zadania-akcje">
                <button className="folder-action" title="Wyżej" disabled={i === 0} onClick={() => przesunZadanie(j.id, c.id, -1)}>
                  ↑
                </button>
                <button
                  className="folder-action"
                  title="Niżej"
                  disabled={i === zadania.length - 1}
                  onClick={() => przesunZadanie(j.id, c.id, 1)}
                >
                  ↓
                </button>
                <button
                  className="folder-action"
                  title="Odepnij od sektora — kafelek zostaje w folderze ścieżki"
                  onClick={() => odepnijZadanie(j.id, c.id)}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="zadania-przyciski">
        <button className="btn btn-maly" onClick={nowe} title="Nowy kafelek-zadanie; otworzy się w edytorze">
          + Nowe zadanie
        </button>
        <button className={`btn btn-maly ${generuj ? 'btn-active' : ''}`} onClick={() => setGeneruj((g) => !g)}>
          Wygeneruj czatem
        </button>
      </div>
      {generuj && <GenerujZadania j={j} onGotowe={() => setGeneruj(false)} />}
    </div>
  )
}

/** Czat układa zadania w stałym formacie, ty wklejasz odpowiedź, a aplikacja
 *  tnie ją na kafelki-zadania. */
function GenerujZadania({ j, onGotowe }: { j: JednostkaNauki; onGotowe: () => void }) {
  const [tekst, setTekst] = useState('')
  const [polecenie, setPolecenie] = useState<string | null>(null)
  const rozpoznane = useMemo(() => podzielZadania(tekst), [tekst])

  const start = async () => {
    const t = await zlozPolecenie(j, { rodzaj: 'zadania' })
    setPolecenie(t)
    await otworzCzat(t)
  }

  const utworz = async () => {
    const ids = await utworzZadania(j.id, rozpoznane)
    window.dispatchEvent(
      new CustomEvent('komp:komunikat', { detail: `Dodano zadania: ${ids.length}` }),
    )
    setTekst('')
    onGotowe()
  }

  return (
    <div className="zadania-generuj">
      <button className="btn btn-primary btn-maly" onClick={start}>
        Kopiuj polecenie ({wez('zadanIle')} zad.) i otwórz {nazwaCzatu()}
      </button>
      {polecenie !== null && (
        <details className="test-czatem-polecenie">
          <summary>Pokaż polecenie (gdyby schowek nie zadziałał)</summary>
          <textarea readOnly value={polecenie} rows={6} onFocus={(e) => e.target.select()} />
        </details>
      )}
      <textarea
        className="sesja-pole"
        rows={5}
        placeholder="Wklej tu całą odpowiedź czatu — aplikacja sama podzieli ją na zadania."
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
      />
      {tekst.trim() !== '' &&
        (rozpoznane.length ? (
          <>
            <ul className="zadania-podglad">
              {rozpoznane.map((z, i) => (
                <li key={i}>
                  <strong>{z.nazwa || `Zadanie ${i + 1}`}</strong>
                  {!z.rozwiazanie && <span className="znaczek znaczek-zalegle">bez rozwiązania</span>}
                </li>
              ))}
            </ul>
            <button className="btn btn-primary btn-maly" onClick={utworz}>
              Utwórz zadania ({rozpoznane.length})
            </button>
          </>
        ) : (
          <p className="hint">
            Nie widzę tu zadań. Czat miał zacząć każde od „=== ZADANIE:" i podać TREŚĆ:, ROZWIĄZANIE:
            i METODA: — poproś go, żeby trzymał się formatu.
          </p>
        ))}
    </div>
  )
}

/** Zwinięty pasek „Zadania (N)" na końcu sektora w Linii. Zadania nie są
 *  węzłami ścieżki, więc Skrypt i PDF ich nie widzą. */
export function PasekZadan({
  sektorId,
  onOtworz,
}: {
  sektorId: string
  onOtworz?: (conceptId: string) => void
}) {
  const j = useLiveQuery(() => db.nauka.get(sektorId), [sektorId])
  const zadania = useZadania(j) ?? []
  const [otwarty, setOtwarty] = useState(false)
  const ids = zadania.map((c) => c.id)
  const wersje = useLiveQuery(() => db.versions.where('conceptId').anyOf(ids).toArray(), [ids.join()]) ?? []
  if (!zadania.length) return null
  return (
    <div
      className={`zadania-pasek ${otwarty ? 'otwarty' : ''}`}
      // pasek siedzi w segmencie Linii — klik nie może zaznaczać kafelka
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      // Fokus na przycisku robi z segmentu „bieżący", a ten dostaje pasek
      // narzędzi — układ przesuwa się między wciśnięciem a puszczeniem
      // myszy i kliknięcie trafiało obok. Przyciski paska fokusu nie biorą.
      onMouseDown={(e) => {
        if ((e.target as Element).closest('button')) e.preventDefault()
      }}
    >
      <button className="zadania-pasek-glowa" onClick={() => setOtwarty((o) => !o)} aria-expanded={otwarty}>
        <span className="zadania-pasek-strzalka">
          <Icon name="rozwin" size={0.9} />
        </span>
        Zadania ({zadania.length})
        <span className="zadania-pasek-sektor">{j?.nazwa}</span>
      </button>
      {otwarty && (
        <div className="zadania-pasek-tresc">
          {zadania.map((c) => (
            <ZadanieWLinii
              key={c.id}
              c={c}
              wersje={wersje.filter((v) => v.conceptId === c.id)}
              onOtworz={onOtworz}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ZadanieWLinii({
  c,
  wersje,
  onOtworz,
}: {
  c: Concept
  wersje: import('../types').BlockVersion[]
  onOtworz?: (id: string) => void
}) {
  const [strona, setStrona] = useState<string | null>(null)
  return (
    <BlockShell
      concept={c}
      versions={wersje}
      versionId={null}
      subpageId={strona}
      onSubpageChange={setStrona}
      onOpenConcept={onOtworz}
      showOpen={!!onOtworz}
      bezPaskaWersji
    />
  )
}
