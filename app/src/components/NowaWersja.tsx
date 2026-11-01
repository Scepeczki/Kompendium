import { useEffect, useState } from 'react'

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

/** Odświeżenie zostawiamy użytkownikowi: sam wybiera chwilę, gdy nie pisze. */
export function NowaWersja() {
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
