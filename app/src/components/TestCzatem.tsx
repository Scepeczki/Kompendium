import { useState } from 'react'
import { adresCzatu, czatWybrany, czytajWynik, CZATY, otworzCzat, zlozPolecenie } from '../czat'
import { pominCzat, wynikCzatu } from '../nauka'
import type { JednostkaNauki } from '../types'

interface Props {
  j: JednostkaNauki
  /** `zero` — test czatem w powtórce zero (wynik zapisuje się od razu),
   *  `rozszerzona` — w powtórce rozszerzonej (wynik idzie z całą sesją). */
  tryb: 'zero' | 'rozszerzona'
  /** Tylko w powtórce rozszerzonej: wynik oddany do sesji. */
  onWynik?: (zaliczone: boolean, luki?: string) => void
  wynik?: { zaliczone: boolean; luki?: string }
  /** Próba: wynik idzie tutaj zamiast do bazy. */
  proba?: (zaliczone: boolean, luki?: string) => void
}

const nazwaCzatu = () => CZATY.find((c) => c.id === czatWybrany())?.nazwa ?? new URL(adresCzatu()).host

/** Test czatem: skopiuj polecenie z materiałem, porozmawiaj z czatem
 *  w drugiej karcie, wróć i zapisz wynik. Czat kończy listą luk — można
 *  wkleić całą jego końcówkę, wynik i luki wyczytamy sami. */
export function TestCzatem({ j, tryb, onWynik, wynik, proba }: Props) {
  const dogrywka = tryb === 'zero' && !!j.luki
  const [tekst, setTekst] = useState<string | null>(null)
  const [luki, setLuki] = useState('')
  const [saLuki, setSaLuki] = useState(false)

  const start = async () => {
    const t = await zlozPolecenie(j, {
      rodzaj: dogrywka ? 'dogrywka' : 'test',
      krotki: tryb === 'rozszerzona',
      technika: j.rozszerzonych ?? 0,
      luki: j.luki,
    })
    setTekst(t)
    await otworzCzat(t)
  }

  const zapisz = async (zaliczone: boolean) => {
    const wyczytane = czytajWynik(luki)
    const listaLuk = zaliczone ? undefined : wyczytane.luki
    if (tryb === 'rozszerzona') onWynik?.(zaliczone, listaLuk)
    else if (proba) proba(zaliczone, listaLuk)
    else await wynikCzatu(j.id, zaliczone, listaLuk)
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
        </div>
      )}
      <div className="test-czatem-krok">
        <button className="btn btn-primary" onClick={start}>
          {dogrywka ? 'Dogrywka' : 'Test czatem'}: kopiuj polecenie i otwórz {nazwaCzatu()}
        </button>
        {tekst !== null && (
          <details className="test-czatem-polecenie">
            <summary>Pokaż polecenie (gdyby schowek nie zadziałał)</summary>
            <textarea readOnly value={tekst} rows={8} onFocus={(e) => e.target.select()} />
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
            rows={5}
            placeholder="Wklej luki — albo całą końcówkę odpowiedzi czatu (od „WYNIK:”)."
            value={luki}
            onChange={(e) => setLuki(e.target.value)}
          />
          <button className="btn btn-primary" disabled={!luki.trim()} onClick={() => zapisz(false)}>
            Zapisz luki
          </button>
        </div>
      )}
      {wynik && !wynik.zaliczone && wynik.luki && <pre className="test-czatem-zapisane">{wynik.luki}</pre>}
    </div>
  )
}
