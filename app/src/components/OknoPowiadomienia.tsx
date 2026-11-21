import { useEffect, useState } from 'react'

/** Treść okienka powiadomienia (program na Windows). Osobne, małe okno bez
 *  ramki w rogu ekranu — parametry przychodzą w adresie:
 *  t = tekst, a = akcja po kliknięciu, e = napis na przycisku,
 *  z = po ilu sekundach zniknąć (0 = zostaje), m = motyw. */
export function OknoPowiadomienia() {
  const q = new URLSearchParams(location.search)
  const tekst = q.get('t') ?? ''
  const akcja = q.get('a') ?? ''
  const etykieta = q.get('e') || 'Otwórz'
  const znika = Number(q.get('z') ?? '0')
  const [wychodzi, setWychodzi] = useState(false)

  const wywolaj = async (polecenie: string, args?: Record<string, unknown>) => {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke(polecenie, args)
  }
  const zamknij = () => {
    setWychodzi(true)
    setTimeout(() => void wywolaj('zamknij_powiadomienie'), 180)
  }

  useEffect(() => {
    if (znika > 0) {
      const t = setTimeout(zamknij, znika * 1000)
      return () => clearTimeout(t)
    }
  }, [znika])

  return (
    <div className={`pw ${wychodzi ? 'pw-wychodzi' : ''}`} role="alert">
      <div className="pw-glowa">
        <img className="pw-ikona" src="favicon.svg" alt="" />
        <span className="pw-nazwa">Kompendium</span>
        <span className="pw-kiedy">teraz</span>
        <button className="pw-x" aria-label="Zamknij" onClick={zamknij}>
          ×
        </button>
      </div>
      <p className="pw-tresc">{tekst}</p>
      <div className="pw-akcje">
        <button className="pw-btn pw-btn-glowny" onClick={() => void wywolaj('z_powiadomienia', { akcja })}>
          {etykieta}
        </button>
        <button className="pw-btn" onClick={zamknij}>
          Później
        </button>
      </div>
    </div>
  )
}
