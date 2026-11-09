import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from './Icon'
import {
  minutyPrzerwy,
  planNauki,
  przemapowany,
  testOtwarty,
  type Pozycja,
} from '../nauka'
import { wez } from '../naukaUstawienia'
import type { CelSesji } from './SesjaNauki'
import type { JednostkaNauki } from '../types'

interface Props {
  onStart: (cel: CelSesji) => void
  onOpenPath: (pathId: string) => void
  onClose: () => void
}

const min = (m: number) => (m <= 0 ? '0 min' : m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`)

const RODZAJ: Record<Pozycja['rodzaj'], string> = { sektor: 'Sektor', fiszka: 'Fiszka', kafelek: 'Kafelek' }

/** Powtórki: co dziś i ile jutro łącznie. Bez dziennego limitu — czego dziś
 *  nie zrobisz, przechodzi na jutro, a lista ustawia najpierw to, co
 *  najbardziej grozi zapomnieniem. */
export function Powtorki({ onStart, onOpenPath, onClose }: Props) {
  // przerwy odliczają minuty, więc lista odświeża się co pół minuty
  const [tik, setTik] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTik((x) => x + 1), 30000)
    return () => window.clearInterval(t)
  }, [])
  const plan = useLiveQuery(() => planNauki(), [tik])

  if (!plan) return <section className="powtorki" />

  const zalegle = plan.dzis.filter((p) => p.dni < 0).length
  const prog = wez('prog')
  const duzo = zalegle >= 5 || (prog > 0 && plan.minutyDzis > prog * 2)
  const start = (p: Pozycja) =>
    onStart(
      p.rodzaj === 'kafelek'
        ? { klucz: p.klucz, sektorId: p.jednostka?.id }
        : { jednostkaId: p.jednostka!.id },
    )

  return (
    <section className="powtorki">
      <header className="settings-page-head">
        <h2>
          <Icon name="nauka" size={1.1} /> Powtórki
        </h2>
        <button className="btn" onClick={onClose}>
          ← Wróć
        </button>
      </header>

      <div className="powtorki-tresc">
        <div className="powtorki-podsumowanie">
          <div className="powtorki-karta">
            <span className="powtorki-karta-tytul">Dziś</span>
            <strong>{plan.dzis.length}</strong>
            <span>≈ {min(plan.minutyDzis)}</span>
          </div>
          <div className="powtorki-karta">
            <span className="powtorki-karta-tytul">Jutro</span>
            <strong>{plan.jutro.length}</strong>
            <span>≈ {min(plan.minutyJutro)}</span>
            {plan.dzis.length > 0 && (
              <span className="powtorki-karta-dopisek">
                jeśli dziś nic nie zrobisz: ≈ {min(plan.minutyJutro + plan.minutyDzis)}
              </span>
            )}
          </div>
        </div>

        {duzo && (
          <p className="powtorki-rada">
            Sporo się nazbierało. Zacznij od góry — tam jest to, co najbardziej grozi zapomnieniem —
            a resztę rozłóż na kilka dni. Spóźniona, a zdana powtórka niczego nie psuje. Nowe sektory
            lepiej odłożyć, aż nadrobisz.
          </p>
        )}

        {plan.wToku.length > 0 && (
          <>
            <h3 className="powtorki-naglowek">W toku — powtórka zero</h3>
            <ul className="powtorki-lista">
              {plan.wToku.map((j) => (
                <WToku key={j.id} j={j} onStart={onStart} onOpenPath={onOpenPath} />
              ))}
            </ul>
          </>
        )}

        <h3 className="powtorki-naglowek">Na dziś</h3>
        {plan.dzis.length === 0 ? (
          <p className="hint">
            Na dziś nic. Sektory tworzysz w ścieżce, w widoku <strong>Nauka</strong>; tam też
            zaczynasz ich naukę.
          </p>
        ) : (
          <ul className="powtorki-lista">
            {plan.dzis.map((p) => (
              <li key={p.id} className="powtorki-pozycja" data-rodzaj={p.rodzaj}>
                <span className={`powtorki-rodzaj rodzaj-${p.rodzaj}`}>{RODZAJ[p.rodzaj]}</span>
                <span className="powtorki-nazwa">
                  {p.nazwa}
                  {p.gdzie && <span className="powtorki-gdzie"> · {p.gdzie}</span>}
                </span>
                <span className="powtorki-info">
                  {p.nowy && <span className="znaczek">nowy</span>}
                  {p.rozszerzona && <span className="znaczek znaczek-rozsz">rozszerzona</span>}
                  {p.dni < 0 && (
                    <span className="znaczek znaczek-zalegle">
                      zaległe {-p.dni} {-p.dni === 1 ? 'dzień' : 'dni'}
                    </span>
                  )}
                  {p.kafelkow !== undefined && <span>{p.kafelkow} kaf.</span>}
                  <span>≈ {min(p.minuty)}</span>
                </span>
                <button className="btn btn-primary" onClick={() => start(p)}>
                  Zacznij
                </button>
              </li>
            ))}
          </ul>
        )}

        {plan.jutro.length > 0 && (
          <details className="powtorki-jutro">
            <summary>
              Jutro: {plan.jutro.length} · ≈ {min(plan.minutyJutro)}
            </summary>
            <ul className="powtorki-lista">
              {plan.jutro.map((p) => (
                <li key={p.id} className="powtorki-pozycja">
                  <span className={`powtorki-rodzaj rodzaj-${p.rodzaj}`}>{RODZAJ[p.rodzaj]}</span>
                  <span className="powtorki-nazwa">
                    {p.nazwa}
                    {p.gdzie && <span className="powtorki-gdzie"> · {p.gdzie}</span>}
                  </span>
                  <span className="powtorki-info">≈ {min(p.minuty)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {plan.uparte.length > 0 && (
          <>
            <h3 className="powtorki-naglowek">
              <Icon name="uwaga" size={1} /> Uparte kafelki
            </h3>
            <p className="hint">
              Ciągle wypadają — to zwykle znak złego sformułowania, nie trudności. Przemapuj je:
              rozbij, dodaj przykład, dopisz do mapy. Potem oznacz jako przemapowane.
            </p>
            <ul className="powtorki-lista">
              {plan.uparte.map(({ pamiec, nazwa }) => (
                <li key={pamiec.klucz} className="powtorki-pozycja">
                  <span className="powtorki-nazwa">{nazwa}</span>
                  <span className="powtorki-info">{pamiec.wpadki} wpadek</span>
                  {pamiec.pathId && (
                    <button className="btn" onClick={() => onOpenPath(pamiec.pathId!)}>
                      Otwórz ścieżkę
                    </button>
                  )}
                  <button className="btn" onClick={() => przemapowany(pamiec.klucz)}>
                    Przemapowałem
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

function WToku({
  j,
  onStart,
  onOpenPath,
}: {
  j: JednostkaNauki
  onStart: (cel: CelSesji) => void
  onOpenPath: (pathId: string) => void
}) {
  const ile = minutyPrzerwy(j)
  const zostalo = Math.max(0, Math.ceil(wez('przerwa') - ile))
  return (
    <li className="powtorki-pozycja">
      <span className="powtorki-rodzaj rodzaj-sektor">Sektor</span>
      <span className="powtorki-nazwa">{j.nazwa}</span>
      <span className="powtorki-info">
        {j.etap === 'zadania'
          ? j.doPoprawy?.length
            ? `test końcowy — do poprawy (${j.doPoprawy.length})`
            : j.zadania?.length
              ? `zadania (${j.zadania.length}) — potem test końcowy`
              : 'zadania (opcjonalne) — potem test końcowy'
          : j.etap === 'czat'
          ? j.luki
            ? 'luki z czatu — poprawki i dogrywka'
            : 'czeka na test czatem'
          : j.etap === 'mapowanie'
          ? j.doPoprawy?.length
            ? `poprawki mapowania (${j.doPoprawy.length})`
            : 'mapowanie'
          : testOtwarty(j)
            ? 'po przerwie — test gotowy'
            : `przerwa · test za ${zostalo} min`}
      </span>
      {j.etap === 'zadania' && j.zadania?.length ? (
        <button className="btn btn-primary" onClick={() => onStart({ jednostkaId: j.id })}>
          Test końcowy
        </button>
      ) : j.etap === 'przerwa' && testOtwarty(j) ? (
        <button className="btn btn-primary" onClick={() => onStart({ jednostkaId: j.id })}>
          Zacznij test
        </button>
      ) : (
        j.pathId && (
          <button className="btn" onClick={() => onOpenPath(j.pathId!)}>
            Otwórz ścieżkę
          </button>
        )
      )}
    </li>
  )
}
