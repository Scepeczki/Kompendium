import { useEffect, useState } from 'react'
import { PoleLiczby } from './PoleLiczby'
import {
  czasPowiadomien,
  czyAutostart,
  powiadom,
  ustawCzasPowiadomien,
  ustawWygladPowiadomien,
  wygladPowiadomien,
  naPulpicie,
  otworzFolderKopii,
  sprawdzAktualizacje,
  ustawAutostart,
  ustawieniaKopii,
  ustawKopie,
  wersjaProgramu,
  wybierzFolderKopii,
  zrobKopieDoFolderu,
  type UstawieniaKopii,
} from '../pulpit'

/** Adres strony z instalatorem programu na Windows. */
export const ADRES_POBIERANIA = 'https://github.com/Scepeczki/Kompendium/releases/latest'

/** Ustawienia → Program. W przeglądarce tylko odnośnik do instalatora. */
export function UstawieniaProgramu() {
  if (!naPulpicie) {
    return (
      <div className="settings-row">
        <span className="settings-label">Kompendium na Windows</span>
        <p className="settings-hint">
          Osobny program: ikonka przy zegarku, przypomnienia przy zamkniętym oknie, start z
          Windows, kopie zapasowe w folderze i aktualizacje. Notatki z tej przeglądarki przenosisz
          kopią zapasową (Dane → Eksportuj kopię, w programie Wczytaj kopię).
        </p>
        <a className="btn" href={ADRES_POBIERANIA} target="_blank" rel="noreferrer">
          Pobierz program
        </a>
      </div>
    )
  }
  return <Program />
}

function Program() {
  const [wersja, setWersja] = useState('')
  const [auto, setAuto] = useState<boolean | null>(null)
  const [kopie, setKopie] = useState<UstawieniaKopii | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)
  const [wyglad, setWyglad] = useState(wygladPowiadomien)
  const [czas, setCzas] = useState(czasPowiadomien)

  const odswiezKopie = () => void ustawieniaKopii().then(setKopie)
  useEffect(() => {
    void wersjaProgramu().then(setWersja)
    void czyAutostart().then(setAuto).catch(() => setAuto(null))
    odswiezKopie()
  }, [])

  return (
    <>
      <div className="settings-row">
        <span className="settings-label">
          Wersja <span className="settings-value">{wersja}</span>
        </span>
        <div className="settings-backup-actions">
          <button className="btn" onClick={() => void sprawdzAktualizacje()}>
            Sprawdź aktualizacje
          </button>
        </div>
        <p className="settings-hint">Program sam sprawdza przy każdym starcie.</p>
      </div>

      <div className="settings-row" data-program="powiadomienia">
        <span className="settings-label">Powiadomienia</span>
        <div className="view-switch">
          <button
            className={`btn ${wyglad === 'kompendium' ? 'btn-active' : ''}`}
            onClick={() => {
              ustawWygladPowiadomien('kompendium')
              setWyglad('kompendium')
            }}
          >
            W stylu Kompendium
          </button>
          <button
            className={`btn ${wyglad === 'windows' ? 'btn-active' : ''}`}
            onClick={() => {
              ustawWygladPowiadomien('windows')
              setWyglad('windows')
            }}
          >
            Dymek Windows
          </button>
        </div>
        {wyglad === 'kompendium' && (
          <label className="menu-wielkosc">
            Znika po
            <PoleLiczby
              wartosc={czas}
              min={0}
              max={600}
              tytul="Po ilu sekundach okienko znika: 0 = zostaje, aż klikniesz"
              onZmien={(v) => {
                ustawCzasPowiadomien(v)
                setCzas(v)
              }}
            />
            <span>s (0 = zostaje, aż klikniesz)</span>
          </label>
        )}
        <div className="settings-backup-actions">
          <button className="btn" onClick={() => void powiadom('Tak wygląda powiadomienie.', { przycisk: 'Otwórz' })}>
            Pokaż przykład
          </button>
        </div>
      </div>

      <div className="settings-row" data-program="autostart">
        <label className="settings-label settings-przelacz">
          <input
            type="checkbox"
            checked={!!auto}
            disabled={auto === null}
            onChange={async (e) => {
              const wl = e.target.checked
              await ustawAutostart(wl)
              setAuto(await czyAutostart())
            }}
          />
          Start razem z Windows (w tle, przy zegarku)
        </label>
        <p className="settings-hint">
          Krzyżyk chowa okno do ikonki przy zegarku — przypomnienia przychodzą dalej. Całkiem
          zamyka „Zakończ" w menu tej ikonki.
        </p>
      </div>

      {kopie && (
        <div className="settings-row" data-program="kopie">
          <label className="settings-label settings-przelacz">
            <input
              type="checkbox"
              checked={kopie.wlaczone}
              onChange={(e) => {
                ustawKopie({ wlaczone: e.target.checked })
                odswiezKopie()
              }}
            />
            Codzienna kopia zapasowa do folderu
          </label>
          <p className="settings-hint settings-sciezka">
            <code>{kopie.folder}</code>
          </p>
          <div className="settings-backup-actions">
            <button
              className="btn"
              disabled={zajety}
              onClick={async () => {
                setZajety(true)
                setStatus(null)
                try {
                  const s = await zrobKopieDoFolderu()
                  setStatus(`Zapisano: ${s}`)
                  odswiezKopie()
                } catch (e) {
                  setStatus(`Nie udało się: ${e instanceof Error ? e.message : String(e)}`)
                } finally {
                  setZajety(false)
                }
              }}
            >
              {zajety ? 'Pakuję…' : 'Zrób kopię teraz'}
            </button>
            <button className="btn" onClick={() => void otworzFolderKopii()}>
              Otwórz folder
            </button>
            <button
              className="btn"
              onClick={async () => {
                const f = await wybierzFolderKopii()
                if (f) {
                  ustawKopie({ folder: f })
                  odswiezKopie()
                }
              }}
            >
              Zmień folder…
            </button>
          </div>
          <label className="menu-wielkosc">
            Trzymaj ostatnie
            <PoleLiczby
              wartosc={kopie.ile}
              min={0}
              max={999}
              tytul="Ile kopii trzymać: 0 = wszystkie"
              onZmien={(v) => {
                ustawKopie({ ile: v })
                odswiezKopie()
              }}
            />
            <span>kopii (0 = wszystkie, nic nie jest kasowane)</span>
          </label>
          {status && <p className="settings-hint settings-status">{status}</p>}
          <p className="settings-hint">
            Ostatnia:{' '}
            {kopie.ostatnia ? new Date(kopie.ostatnia).toLocaleString('pl') : 'jeszcze nie było'}.
            Folder możesz trzymać w chmurze (np. Google Drive) — tak przeniesiesz notatki na inny
            komputer.
          </p>
        </div>
      )}
    </>
  )
}
