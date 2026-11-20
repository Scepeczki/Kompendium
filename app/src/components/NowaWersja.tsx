import { useEffect, useState } from 'react'
import { naPulpicie, zainstalujAktualizacje } from '../pulpit'

const CO_ILE_MS = 5 * 60 * 1000

/** Karta otwarta przed publikacją dalej chodzi na starym kodzie i nic tego nie
 *  zdradza. Strona główna wymienia aktualny plik programu, więc wystarczy
 *  sprawdzić, czy jest tam ten, z którego właśnie działamy. */
async function jestNowsza(): Promise<boolean> {
  const skrypt = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
  const biezacy = skrypt?.src.split('/').pop()
  if (!biezacy) return false
  const odp = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })
  if (!odp.ok) return false
  const strona = await odp.text()
  return strona.includes('assets/index-') && !strona.includes(biezacy)
}

/** Pasek „jest nowa wersja". W przeglądarce: odświeżenie strony. W programie
 *  na Windows: instalacja aktualizacji (szuka jej pulpit.ts). Moment wybiera
 *  użytkownik — sam wie, kiedy nie pisze. */
export function NowaWersja() {
  if (naPulpicie) return <NowaWersjaProgramu />
  return <NowaWersjaStrony />
}

function NowaWersjaStrony() {
  const [jest, setJest] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const sprawdz = () => {
      jestNowsza()
        .then(setJest)
        .catch(() => {
          // bez sieci nie ma czego porównywać
        })
    }
    sprawdz()
    const czasomierz = window.setInterval(sprawdz, CO_ILE_MS)
    window.addEventListener('focus', sprawdz)
    return () => {
      window.clearInterval(czasomierz)
      window.removeEventListener('focus', sprawdz)
    }
  }, [])

  if (!jest) return null
  return (
    <button className="nowa-wersja" onClick={() => window.location.reload()}>
      Jest nowa wersja programu. Kliknij, aby odświeżyć.
    </button>
  )
}

function NowaWersjaProgramu() {
  const [wersja, setWersja] = useState<string | null>(null)
  const [trwa, setTrwa] = useState(false)

  useEffect(() => {
    const h = (e: Event) => setWersja((e as CustomEvent<string>).detail)
    window.addEventListener('komp:aktualizacja', h)
    return () => window.removeEventListener('komp:aktualizacja', h)
  }, [])

  if (!wersja) return null
  return (
    <button
      className="nowa-wersja"
      disabled={trwa}
      onClick={async () => {
        setTrwa(true)
        try {
          await zainstalujAktualizacje()
        } catch (e) {
          window.dispatchEvent(
            new CustomEvent('komp:komunikat', {
              detail: `Aktualizacja się nie udała: ${e instanceof Error ? e.message : String(e)}`,
            }),
          )
          setTrwa(false)
        }
      }}
    >
      {trwa ? 'Pobieram i instaluję…' : `Jest nowa wersja Kompendium (${wersja}). Kliknij, aby zainstalować.`}
    </button>
  )
}
