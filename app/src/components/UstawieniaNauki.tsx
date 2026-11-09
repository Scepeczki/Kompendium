import { useEffect, useState } from 'react'
import { PoleLiczby } from './PoleLiczby'
import {
  NAUKA,
  pytaniaTekst,
  ustaw,
  ustawPytania,
  ustawZasady,
  wez,
  zasadyTekst,
  PYTANIA_DOMYSLNE,
  ZASADY_DOMYSLNE,
  type KluczNauki,
} from '../naukaUstawienia'
import {
  CZATY,
  DOMYSLNE,
  czatWZero,
  czatWlasnyAdres,
  czatWybrany,
  eksperyment,
  polecenie,
  trybCzatu,
  ustawCzat,
  ustawCzatWZero,
  ustawEksperyment,
  ustawPolecenie,
  ustawTrybCzatu,
  type RodzajPolecenia,
  type TrybCzatu,
} from '../czat'

/** Ustawienia → Nauka. Wiersze liczb rysują się z jednej tabeli. */
export function UstawieniaNauki() {
  const [, odswiez] = useState(0)
  useEffect(() => {
    const h = () => odswiez((x) => x + 1)
    window.addEventListener('komp:ui', h)
    return () => window.removeEventListener('komp:ui', h)
  }, [])

  const wiersz = (k: KluczNauki) => {
    const d = NAUKA[k]
    return (
      <div className="settings-row" key={k} data-nauka={k}>
        <span className="settings-label">{d.nazwa}</span>
        <label className="menu-wielkosc">
          <PoleLiczby
            wartosc={wez(k)}
            min={d.min}
            max={d.max}
            tytul={`${d.nazwa}: od ${d.min} do ${d.max}`}
            onZmien={(v) => ustaw(k, v)}
          />
          <span>{d.jednostka}</span>
        </label>
        <p className="settings-hint">{d.opis}</p>
      </div>
    )
  }

  return (
    <>
      <h3 className="settings-grupa">Terminy</h3>
      {wiersz('cel')}
      {wiersz('prog')}

      <h3 className="settings-grupa">Powtórka zero</h3>
      {wiersz('przerwa')}
      {wiersz('przypomnij')}
      {wiersz('sektorOd')}
      {wiersz('sektorDo')}

      <h3 className="settings-grupa">Powtórka rozszerzona</h3>
      <p className="settings-hint">
        Zwykła powtórka jest krótka: zakryj, napisz, odsłoń, oceń. Co jakiś czas wypada
        rozszerzona — na razie trudny tryb (zakryte także nazwy kafelków), później też czat
        i zadania.
      </p>
      {wiersz('rozszOd')}
      {wiersz('rozszCo')}
      {wiersz('rozszDaleko')}
      {wiersz('rozszCoDaleko')}

      <h3 className="settings-grupa">Ocena sektora</h3>
      {wiersz('progDobrze')}
      {wiersz('progNie')}
      {wiersz('uparty')}

      <h3 className="settings-grupa">Pytania i zasady</h3>
      <PoleTekstu
        nazwa="Pytania nauki"
        opis="Jedna lista na wszystko: w mapowaniu do wglądu (nie jako formularz), w teście jako polecenia, później w poleceniu dla czatu. Jedno pytanie w wierszu."
        wartosc={pytaniaTekst()}
        domyslna={PYTANIA_DOMYSLNE}
        onZapisz={ustawPytania}
      />
      <PoleTekstu
        nazwa="Zasady mapowania"
        opis="Pokazują się przy mapowaniu jako przypomnienie."
        wartosc={zasadyTekst()}
        domyslna={ZASADY_DOMYSLNE}
        onZapisz={ustawZasady}
      />

      <h3 className="settings-grupa">Czat</h3>
      <div className="settings-row" data-nauka="czat">
        <span className="settings-label">Który czat</span>
        <div className="settings-choice">
          {[...CZATY.map((c) => ({ id: c.id as string, nazwa: c.nazwa })), { id: 'wlasny', nazwa: 'Własny adres' }].map((c) => (
            <button
              key={c.id}
              className={`btn settings-choice-btn ${czatWybrany() === c.id ? 'btn-active' : ''}`}
              onClick={() => ustawCzat(c.id)}
            >
              {c.nazwa}
            </button>
          ))}
        </div>
        {czatWybrany() === 'wlasny' && (
          <input
            className="settings-textarea"
            placeholder="https://…"
            aria-label="Adres czatu"
            value={czatWlasnyAdres()}
            onChange={(e) => ustawCzat('wlasny', e.target.value)}
          />
        )}
        <p className="settings-hint">
          Bez kosztów i bez klucza: aplikacja kopiuje polecenie razem z treścią sektora do schowka
          i otwiera czat w nowej karcie, a ty tylko wklejasz (Ctrl+V). Działa z każdym czatem, także
          z darmowym. Wzory idą jako LaTeX, zdjęcia jako opis „[rysunek: …]".
        </p>
      </div>
      <label className="settings-row settings-check">
        <span className="settings-label">
          <input type="checkbox" checked={czatWZero()} onChange={(e) => ustawCzatWZero(e.target.checked)} /> Test
          czatem w powtórce zero
        </span>
        <span className="settings-hint">Po zaliczonym teście zakrytym — zanim sektor pójdzie do powtórek.</span>
      </label>
      <div className="settings-row">
        <span className="settings-label">Czat w powtórkach rozszerzonych</span>
        <div className="settings-choice">
          {(
            [
              ['mieszanka', 'Słabsza mieszanka'],
              ['jedna', 'Jedna technika naraz'],
            ] as [TrybCzatu, string][]
          ).map(([t, n]) => (
            <button
              key={t}
              className={`btn settings-choice-btn ${trybCzatu() === t ? 'btn-active' : ''}`}
              onClick={() => ustawTrybCzatu(t)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="settings-hint">
          Mieszanka: wszystkie techniki (Feynman, przewidywanie zmian, wykrywanie błędów, kompresja),
          ale mniej pytań. Jedna naraz: za każdym razem inna. W powtórce zero zawsze pełny test.
        </p>
      </div>
      <label className="settings-row settings-check">
        <span className="settings-label">
          <input type="checkbox" checked={eksperyment()} onChange={(e) => ustawEksperyment(e.target.checked)} />{' '}
          Eksperyment: „sprawdź czatem moje odpowiedzi"
        </span>
        <span className="settings-hint">
          Przycisk przy ocenie: czat porównuje to, co napisałeś z pamięci, z materiałem. Podstawą zostaje
          twoja ocena — to tylko próba.
        </span>
      </label>
      {(
        [
          ['test', 'Polecenie: test czatem'],
          ['dogrywka', 'Polecenie: dogrywka z luk'],
          ['sprawdz', 'Polecenie: sprawdź moje odpowiedzi'],
        ] as [RodzajPolecenia, string][]
      ).map(([r, n]) => (
        <PoleTekstu
          key={r}
          nazwa={n}
          opis="W miejsce {NAZWA}, {MATERIAL}, {PYTANIA}, {TECHNIKI}, {ILE}, {LUKI} i {ODPOWIEDZI} aplikacja wstawia nazwę sektora, jego treść, pytania nauki, techniki, liczbę pytań, luki i twoje odpowiedzi."
          wartosc={polecenie(r)}
          domyslna={DOMYSLNE[r]}
          onZapisz={(t) => ustawPolecenie(r, t)}
        />
      ))}
    </>
  )
}

function PoleTekstu({
  nazwa,
  opis,
  wartosc,
  domyslna,
  onZapisz,
}: {
  nazwa: string
  opis: string
  wartosc: string
  domyslna: string
  onZapisz: (t: string) => void
}) {
  const [tekst, setTekst] = useState(wartosc)
  return (
    <div className="settings-row settings-row-tekst">
      <span className="settings-label">{nazwa}</span>
      <textarea
        className="settings-textarea"
        rows={Math.max(5, tekst.split('\n').length + 1)}
        value={tekst}
        aria-label={nazwa}
        onChange={(e) => {
          setTekst(e.target.value)
          onZapisz(e.target.value)
        }}
      />
      <p className="settings-hint">
        {opis}{' '}
        {tekst !== domyslna && (
          <button
            className="btn btn-link"
            onClick={() => {
              setTekst(domyslna)
              onZapisz(domyslna)
            }}
          >
            Przywróć domyślne
          </button>
        )}
      </p>
    </div>
  )
}
