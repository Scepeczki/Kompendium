import { useMemo, useState } from 'react'
import { renderMarkdown } from '../markdown'
import {
  adresCzatu,
  czatWybrany,
  czytajWynik,
  CZATY,
  kopiujPolecenie,
  otworzCzat,
  zlozPolecenie,
} from '../czat'
import { dopasujKafelkiCzatu, pominCzat, wynikCzatu } from '../nauka'
import { zadaniaWZero } from '../naukaUstawienia'
import type { JednostkaNauki, OcenaCzatu } from '../types'

interface Props {
  j: JednostkaNauki
  /** `zero` — test czatem w powtórce zero (wynik zapisuje się od razu),
   *  `rozszerzona` — w powtórce rozszerzonej (wynik idzie z całą sesją). */
  tryb: 'zero' | 'rozszerzona'
  /** Tylko w powtórce rozszerzonej: wynik oddany do sesji. */
  onWynik?: (zaliczone: boolean, luki?: string) => void
  wynik?: { zaliczone: boolean; luki?: string }
  /** Próba: wynik idzie tutaj zamiast do bazy. */
  proba?: (zaliczone: boolean, luki?: string, zCzatu?: { kafelki: OcenaCzatu[]; klucz?: string }) => void
}

const nazwaCzatu = () => CZATY.find((c) => c.id === czatWybrany())?.nazwa ?? new URL(adresCzatu()).host

const NAPIS: Record<OcenaCzatu['ocena'], string> = { tak: 'Tak', czesciowo: 'Częściowo', nie: 'Nie' }

/** Kafelki ocenione przez czat — kolorowe wiersze, najpierw słabsze. */
export function OcenyCzatu({ kafelki }: { kafelki: OcenaCzatu[] }) {
  if (!kafelki.length) return null
  const kolej = ['nie', 'czesciowo', 'tak']
  return (
    <ul className="test-czatem-kafelki">
      {[...kafelki]
        .sort((a, b) => kolej.indexOf(a.ocena) - kolej.indexOf(b.ocena))
        .map((k, i) => (
          <li key={i} className={`zaznacz-${k.ocena}`}>
            <span className="test-czatem-ocena">{NAPIS[k.ocena]}</span>
            <span className="test-czatem-kafelek">{k.nazwa}</span>
            {k.uwaga && <span className="test-czatem-uwaga">{k.uwaga}</span>}
          </li>
        ))}
    </ul>
  )
}

/** Test czatem: skopiuj polecenie z materiałem, porozmawiaj z czatem
 *  w drugim oknie, wróć i wklej jego końcówkę. Czat ocenia każdy kafelek,
 *  wypisuje luki i klucz odpowiedzi — program to odczytuje sam. */
export function TestCzatem({ j, tryb, onWynik, wynik, proba }: Props) {
  const dogrywka = tryb === 'zero' && !!j.luki
  const [tekst, setTekst] = useState<string | null>(null)
  const [luki, setLuki] = useState('')
  const [saLuki, setSaLuki] = useState(false)
  const odczytane = useMemo(() => (luki.trim() ? czytajWynik(luki) : null), [luki])

  const zloz = async () => {
    const t = await zlozPolecenie(j, {
      rodzaj: dogrywka ? 'dogrywka' : 'test',
      krotki: tryb === 'rozszerzona',
      technika: j.rozszerzonych ?? 0,
      luki: j.luki,
    })
    setTekst(t)
    return t
  }

  const zapisz = async (zaliczone: boolean) => {
    const w = czytajWynik(luki)
    const listaLuk = zaliczone ? undefined : w.luki || undefined
    const kafelki = await dopasujKafelkiCzatu(j, w.kafelki)
    if (tryb === 'rozszerzona') onWynik?.(zaliczone, listaLuk)
    else if (proba) proba(zaliczone, listaLuk, { kafelki, klucz: w.klucz })
    else await wynikCzatu(j.id, zaliczone, listaLuk, { kafelki, klucz: w.klucz })
    setSaLuki(false)
    setLuki('')
  }

  return (
    <div className="test-czatem">
      {dogrywka && (
        <div className="test-czatem-luki">
          <strong>Luki z czatu</strong> — popraw mapowanie tych miejsc, potem dogrywka (czat sprawdzi
          tylko je):
          <pre>{j.luki}</pre>
          {j.czatKafelki && <OcenyCzatu kafelki={j.czatKafelki} />}
          {j.kluczCzatu && (
            <details className="test-czatem-klucz">
              <summary>Klucz odpowiedzi od czatu</summary>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.kluczCzatu) }} />
            </details>
          )}
        </div>
      )}
      <div className="test-czatem-krok">
        <button className="btn btn-primary" onClick={async () => void otworzCzat(await zloz())}>
          {dogrywka ? 'Dogrywka' : 'Test czatem'}: kopiuj i otwórz {nazwaCzatu()}
        </button>
        <button className="btn" onClick={async () => void kopiujPolecenie(await zloz())}>
          Tylko kopiuj
        </button>
        {tekst !== null && (
          <details className="test-czatem-polecenie">
            <summary>Pokaż polecenie</summary>
            <textarea readOnly value={tekst} rows={10} onFocus={(e) => e.target.select()} />
          </details>
        )}
      </div>
      <div className="test-czatem-wynik">
        <span>Jak poszło w czacie?</span>
        <button
          className={`btn zaznacz-tak ${wynik?.zaliczone === true ? 'btn-active' : ''}`}
          onClick={() => zapisz(true)}
        >
          Zaliczone
        </button>
        <button
          className={`btn zaznacz-nie ${wynik?.zaliczone === false || saLuki ? 'btn-active' : ''}`}
          onClick={() => setSaLuki(true)}
        >
          Są luki
        </button>
        {tryb === 'zero' && !dogrywka && !proba && (
          <button className="btn btn-link" title="Np. bez internetu — zapisze się, że pominięty" onClick={() => pominCzat(j.id)}>
            Pomiń czat tym razem
          </button>
        )}
      </div>
      {saLuki && (
        <div className="test-czatem-wklej">
          <textarea
            className="sesja-pole"
            rows={6}
            placeholder="Wklej końcówkę odpowiedzi czatu (od „WYNIK:”) — ocenę kafelków, luki i klucz odczytam sam. Same luki też wystarczą."
            value={luki}
            onChange={(e) => setLuki(e.target.value)}
          />
          {odczytane && odczytane.kafelki.length > 0 && (
            <div className="test-czatem-odczyt">
              <span className="sesja-etykieta">Czat ocenił kafelki</span>
              <OcenyCzatu kafelki={odczytane.kafelki} />
              {odczytane.klucz && <span className="hint">+ klucz odpowiedzi do słabszych kafelków</span>}
            </div>
          )}
          <button className="btn btn-primary" disabled={!luki.trim()} onClick={() => zapisz(false)}>
            Zapisz luki
          </button>
        </div>
      )}
      {wynik && !wynik.zaliczone && wynik.luki && <pre className="test-czatem-zapisane">{wynik.luki}</pre>}
    </div>
  )
}

/** Test czatem i dogrywka na próbę — na kopii sektora w pamięci, bez zapisu.
 *  Używany w Ustawienia → Próba i zaraz po teście zakrytym w próbie. */
export function CzatNaProbe({ j, onKoniec }: { j: JednostkaNauki; onKoniec?: () => void }) {
  const [kopia, setKopia] = useState<JednostkaNauki | null>({ ...j, etap: 'czat', luki: undefined, czatKafelki: undefined, kluczCzatu: undefined })
  const [koniec, setKoniec] = useState<string | null>(null)
  return (
    <div className="czat-na-probe">
      {kopia && (
        <TestCzatem
          key={kopia.luki ? 'dogrywka' : 'test'}
          j={kopia}
          tryb="zero"
          proba={(zaliczone, luki, zCzatu) => {
            if (zaliczone) {
              setKopia(null)
              setKoniec(
                'Zaliczone. W prawdziwej nauce sektor poszedłby dalej: ' +
                  (zadaniaWZero() ? 'zadania (opcjonalne) i test końcowy.' : 'powtórki.'),
              )
            } else {
              // jak naprawdę: luki zostają przy sektorze, następny krok to dogrywka
              setKopia({
                ...kopia,
                luki: luki?.trim() || kopia.luki,
                czatKafelki: zCzatu?.kafelki.length ? zCzatu.kafelki : kopia.czatKafelki,
                kluczCzatu: zCzatu?.klucz || kopia.kluczCzatu,
              })
            }
          }}
        />
      )}
      {koniec && <p className="settings-hint settings-status">{koniec}</p>}
      {onKoniec && (
        <button className="btn btn-link" onClick={onKoniec}>
          {koniec ? 'Jeszcze raz' : 'Zakończ próbę czatu'}
        </button>
      )}
    </div>
  )
}
