import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { naPulpicie, powiadom } from '../pulpit'
import { zadaniaWZero } from '../naukaUstawienia'
import { TestCzatem } from './TestCzatem'
import type { CelSesji } from './SesjaNauki'
import type { JednostkaNauki } from '../types'

const komunikat = (tekst: string) =>
  window.dispatchEvent(new CustomEvent('komp:komunikat', { detail: tekst }))

/** Otwiera sesję nauki (App słucha tego zdarzenia). */
const otworzSesje = (cel: CelSesji) => window.dispatchEvent(new CustomEvent('komp:sesja', { detail: cel }))

/** Ustawienia → Próba: zobacz powiadomienia i przejdź testy na swoim
 *  sektorze, ale bez skutków — terminy, historia i etap sektora zostają. */
export function ProbaNauki() {
  const sektory =
    useLiveQuery(
      async () =>
        (await db.nauka.toArray()).filter((j) => j.rodzaj === 'sektor' && (j.wezly?.length ?? 0) > 0),
      [],
    ) ?? []
  const [wybrany, setWybrany] = useState('')
  const sektor = sektory.find((s) => s.id === wybrany) ?? sektory[0]
  const [czatJ, setCzatJ] = useState<JednostkaNauki | null>(null)
  const [poCzacie, setPoCzacie] = useState<string | null>(null)

  return (
    <>
      <h3 className="settings-grupa">Powiadomienia</h3>
      <div className="settings-row" data-proba="powiadomienia">
        <div className="settings-backup-actions">
          <button
            className="btn"
            onClick={() => {
              const t = `Przerwa minęła — czas na test sektora „${sektor?.nazwa ?? 'Przykład'}".`
              komunikat(t)
              void powiadom(t, { przycisk: 'Otwórz' })
            }}
          >
            Test po przerwie
          </button>
          <button
            className="btn"
            onClick={() => void powiadom('Na dziś czeka powtórka: 3.', { akcja: 'powtorki', przycisk: 'Do Powtórek' })}
          >
            Powtórki na dziś
          </button>
          {naPulpicie && (
            <button
              className="btn"
              onClick={() => {
                void powiadom('Jest nowa wersja Kompendium (9.9.9).', { akcja: 'aktualizacja', przycisk: 'Zobacz' })
                window.dispatchEvent(new CustomEvent('komp:aktualizacja', { detail: '9.9.9 — próba' }))
              }}
            >
              Nowa wersja
            </button>
          )}
        </div>
        <p className="settings-hint">
          Pokazują się tak jak naprawdę: dymek Windows (zostaje w centrum powiadomień) i miganie
          ikony na pasku zadań.
          {!naPulpicie && ' W przeglądarce tylko, jeśli pozwoliłeś jej na powiadomienia.'}
        </p>
      </div>

      <h3 className="settings-grupa">Testy na próbę</h3>
      {sektory.length === 0 ? (
        <p className="settings-hint">Najpierw zrób jakiś sektor w widoku Nauka.</p>
      ) : (
        <>
          <div className="settings-row">
            <label className="settings-pole">
              <span>Sektor</span>
              <select
                className="input"
                value={sektor?.id}
                onChange={(e) => {
                  setWybrany(e.target.value)
                  setCzatJ(null)
                  setPoCzacie(null)
                }}
              >
                {sektory.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nazwa} ({s.wezly.length} kaf.)
                  </option>
                ))}
              </select>
            </label>
            <p className="settings-hint">
              Wynik, termin i to, co do poprawy, policzą się naprawdę — ale nic się nie zapisze.
              Sektor zostaje dokładnie taki, jaki był.
            </p>
          </div>

          {sektor && (
            <>
              <div className="settings-row" data-proba="test">
                <span className="settings-label">Test zakryty</span>
                <div className="settings-backup-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      otworzSesje({
                        jednostkaId: sektor.id,
                        proba: { etap: 'przerwa', karta: undefined, douczanie: undefined, luki: undefined },
                      })
                    }
                  >
                    Test po mapowaniu (pierwszy)
                  </button>
                </div>
                <p className="settings-hint">
                  Piszesz z pamięci, odsłaniasz, oceniasz każdy kafelek: Tak / Częściowo / Nie.
                </p>
              </div>

              <div className="settings-row" data-proba="czat">
                <span className="settings-label">Test czatem i dogrywka</span>
                {!czatJ ? (
                  <div className="settings-backup-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setPoCzacie(null)
                        setCzatJ({ ...sektor, etap: 'czat', luki: undefined })
                      }}
                    >
                      Zacznij test czatem
                    </button>
                  </div>
                ) : (
                  <TestCzatem
                    key={czatJ.luki ? 'dogrywka' : 'test'}
                    j={czatJ}
                    tryb="zero"
                    proba={(zaliczone, luki, zCzatu) => {
                      if (zaliczone) {
                        setCzatJ(null)
                        setPoCzacie(
                          'Zaliczone. W prawdziwej nauce sektor poszedłby dalej: ' +
                            (zadaniaWZero() ? 'zadania (opcjonalne) i test końcowy.' : 'powtórki.'),
                        )
                      } else {
                        // jak naprawdę: luki zostają przy sektorze, następny krok to dogrywka
                        setCzatJ({
                          ...czatJ,
                          luki: luki?.trim() || czatJ.luki,
                          czatKafelki: zCzatu?.kafelki.length ? zCzatu.kafelki : czatJ.czatKafelki,
                          kluczCzatu: zCzatu?.klucz || czatJ.kluczCzatu,
                        })
                      }
                    }}
                  />
                )}
                {poCzacie && <p className="settings-hint settings-status">{poCzacie}</p>}
                {czatJ && (
                  <button className="btn btn-link" onClick={() => setCzatJ(null)}>
                    Zakończ próbę czatu
                  </button>
                )}
                <p className="settings-hint">
                  Polecenie naprawdę trafia do schowka i otwiera się czat. „Są luki" → wklejasz luki
                  i wtedy pojawia się dogrywka tylko z nich.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
