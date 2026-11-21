import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { naPulpicie, powiadom } from '../pulpit'
import { CzatNaProbe } from './TestCzatem'
import type { CelSesji } from './SesjaNauki'
import type { JednostkaNauki, Przypomnienie } from '../types'

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
  const [zakryte, setZakryte] = useState<Przypomnienie>('tak')

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
                  <button
                    className="btn"
                    data-proba-rozszerzona
                    onClick={() =>
                      otworzSesje({
                        jednostkaId: sektor.id,
                        proba: { etap: 'powtorki', czatNastepnym: true, douczanie: undefined, luki: undefined, przemapowanie: undefined },
                      })
                    }
                  >
                    Powtórka rozszerzona z czatem
                  </button>
                  <button
                    className="btn"
                    data-proba-krotki
                    onClick={() =>
                      otworzSesje({
                        jednostkaId: sektor.id,
                        przemapowanie: true,
                        proba: {
                          etap: 'czat',
                          luki: '- (próba) luki z dogrywek',
                          przemapowanie: {
                            wezly: sektor.wezly.slice(0, 2),
                            zadania: [],
                            etap: 'przerwa',
                            od: new Date(0).toISOString(),
                          },
                        },
                      })
                    }
                  >
                    Krótki test po limicie dogrywek
                  </button>
                </div>
                <p className="settings-hint">
                  Piszesz z pamięci, odsłaniasz, oceniasz każdy kafelek: Tak / Częściowo / Nie. Po
                  pierwszym teście od razu test czatem — z gotowymi podsumowaniami do kliknięcia.
                  „Powtórka rozszerzona" pokazuje łączenie ocen w zwykłej powtórce, a „Krótki test"
                  — test samych kafelków z NIE po limicie dogrywek.
                </p>
              </div>

              <div className="settings-row" data-proba="czat">
                <span className="settings-label">Test czatem i dogrywka</span>
                {!czatJ ? (
                  <div className="settings-backup-actions">
                    <label className="settings-pole">
                      <span>Test zakryty przed czatem</span>
                      <select className="input" value={zakryte} onChange={(e) => setZakryte(e.target.value as Przypomnienie)}>
                        <option value="tak">wszystko Tak</option>
                        <option value="czesciowo">wszystko Częściowo</option>
                      </select>
                    </label>
                    <button className="btn btn-primary" onClick={() => setCzatJ(sektor)}>
                      Zacznij test czatem
                    </button>
                  </div>
                ) : (
                  <CzatNaProbe key={czatJ.id} j={czatJ} zakryte={() => zakryte} />
                )}
                <p className="settings-hint">
                  Nie musisz rozmawiać z czatem: kliknij gotowe podsumowanie (wszystko TAK, z CZĘŚCIOWO,
                  z NIE i NIESPRAWDZONY, same luki) i zobacz, co program z nim zrobi — ocena łączna,
                  luki w wymaganiach, dogrywka, limit dogrywek. Możesz też wkleić prawdziwe podsumowanie.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
